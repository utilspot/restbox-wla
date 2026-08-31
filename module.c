#include "config.h"

#define NQ_LOG_TAG "restbox"

#include <libnetq/Log.h>
#include <libnetq/String.h>
#include <libnetq/Library.h>
#include <libnetq/Path.h>
#include <libnetq/ErrorCode.h>
#include <libnetq/HttpHeader.h>
#include <libnetq/HttpMethod.h>
#include <libnetq/HttpStatus.h>
#include <libnetq/MediaType.h>
#include <libnetq/Module.h>
#include <libnetq/Malloc.h>
#include <libnetq/ByteBuffer.h>
#include <libnetq/MinMax.h>
#include <libnetq/JSON.h>
#include <libnetq/http/HttpRequest.h>
#include <libnetq/web/WebRequest.h>
#include <libnetq/web/WebResponse.h>
#include <libnetq/web/WebServer.h>
#include <libnetq/web/WebManifest.h>

#define RESTBOX_TIMEOUT_MS_MIN 1000
#define RESTBOX_TIMEOUT_MS_MAX 120000

typedef struct WebRestboxExecutor WebRestboxExecutor;
struct WebRestboxExecutor {
  NQWebExecutor executor;
  NQWebManifestListeners manifestListeners;
  struct NQWebRequestListener sendListener;
};

static bool responseJsonWrite(void* userdata, const char* characters, size_t size)
{
  NQWebResponse* response = (NQWebResponse*)userdata;
  return NQWebResponse_write(response, characters, size) >= 0;
}

static int upstreamBodyWrite(void* userdata, const void* data, size_t size)
{
  NQByteBuffer* buffer = (NQByteBuffer*)userdata;
  if (!NQByteBuffer_append(buffer, (const uint8_t*)data, size))
    return -1;
  return (int)size;
}

static bool isHttpUrl(const char* url)
{
  return url != NULL && (strncmp(url, "http://", 7) == 0 || strncmp(url, "https://", 8) == 0);
}

static int writeError(NQWebResponse* response, int status, const char* kind, const char* message)
{
  NQJSONWriter writer;
  NQJSONWriter_init(&writer, &responseJsonWrite, response);
  NQJSONWriter_writeObjectBegin(&writer);
  NQJSONWriter_writeKeyString(&writer, "error", message);
  if (kind != NULL)
    NQJSONWriter_writeKeyString(&writer, "kind", kind);
  NQJSONWriter_writeObjectEnd(&writer);
  NQJSONWriter_finalize(&writer);
  return status;
}

static int writeSendResult(NQHttpRequest* httpRequest, const NQByteBuffer* body, NQWebResponse* response)
{
  int statusCode = NQHttpRequest_responseStatusCode(httpRequest);
  const char* reason = NQHttpRequest_responseReasonText(httpRequest);

  int64_t timeMs = 0;
  NQHttpRequest_responseTimeMs(httpRequest, &timeMs);

  const uint8_t* bodyData = NQByteBuffer_data(body);
  size_t bodySize = NQByteBuffer_size(body);

  NQJSONWriter writer;
  NQJSONWriter_init(&writer, &responseJsonWrite, response);
  NQJSONWriter_writeObjectBegin(&writer);

  NQJSONWriter_writeKeyInt64(&writer, "status", statusCode);
  NQJSONWriter_writeKeyString(&writer, "statusText", reason != NULL ? reason : "");

  NQJSONWriter_writeKeyObjectBegin(&writer, "headers");
  NQHttpRequestHeaderIter* hdrIter = NQHttpRequest_responseHeaderFirst(httpRequest);
  while (hdrIter != NULL) {
    const char* name = NQHttpRequestHeaderIter_name(hdrIter);
    const char* value = NQHttpRequestHeaderIter_value(hdrIter);
    NQJSONWriter_writeKeyString(&writer, name, value);
    hdrIter = NQHttpRequest_responseHeaderNext(httpRequest, hdrIter);
  }
  NQJSONWriter_writeObjectEnd(&writer);

  NQJSONWriter_writeKeyString2(&writer, "body", bodySize != 0 ? (const char*)bodyData : "", bodySize);
  NQJSONWriter_writeKeyInt64(&writer, "timeMs", timeMs > 0 ? timeMs : 0);
  NQJSONWriter_writeKeyInt64(&writer, "size", (int64_t)bodySize);

  NQJSONWriter_writeObjectEnd(&writer);
  NQJSONWriter_finalize(&writer);

  if (writer.hasError) {
    NQ_LOGE("failed to serialise " RESTBOX_SERVICE_URL " response JSON");
    return NQ_HTTP_INTERNAL_SERVER_ERROR;
  }

  return NQ_HTTP_OK;
}

static int proxySend(NQJSON* json, NQHttpRequest* httpRequest, const NQByteBuffer* upstreamBody, NQWebResponse* response)
{
  if (!NQJSON_isObject(json))
    return writeError(response, NQ_HTTP_BAD_REQUEST, NULL, "Request body must be a JSON object");

  const char* method = NULL;
  if (!NQJSON_objectGetString(json, "method", &method) || method == NULL || method[0] == '\0')
    return writeError(response, NQ_HTTP_BAD_REQUEST, NULL, "Missing required field: method");

  const char* url = NULL;
  if (!NQJSON_objectGetString(json, "url", &url) || !isHttpUrl(url))
    return writeError(response, NQ_HTTP_BAD_REQUEST, NULL, "Field 'url' must be an http(s) URL");

  if (!NQHttpRequest_setMethod(httpRequest, method) || !NQHttpRequest_setUrl(httpRequest, url))
    return writeError(response, NQ_HTTP_INTERNAL_SERVER_ERROR, NULL, "Unable to build the upstream request");

  NQJSON* headers = NQJSON_objectGet(json, "headers");
  if (headers != NULL && !NQJSON_isNull(headers)) {
    if (!NQJSON_isObject(headers))
      return writeError(response, NQ_HTTP_BAD_REQUEST, NULL, "Field 'headers' must be an object");
    for (NQJSON_ObjectIter* it = NQJSON_objectIterFirst(headers); it != NULL; it = NQJSON_objectIterNext(headers, it)) {
      const char* name = NQJSON_objectIterKey(it);
      NQJSON* value = NQJSON_objectIterValue(it);
      if (!NQJSON_isString(value))
        return writeError(response, NQ_HTTP_BAD_REQUEST, NULL, "Header values must be strings");
      if (!NQHttpRequest_addHeader(httpRequest, name, NQJSON_asString(value)))
        return writeError(response, NQ_HTTP_INTERNAL_SERVER_ERROR, NULL, "Unable to set an upstream header");
    }
  }

  bool followRedirects = true;
  NQJSON_objectGetBool(json, "followRedirects", &followRedirects);
  NQHttpRequest_setFollowLocation(httpRequest, followRedirects);

  int64_t timeoutMs = 0;
  if (NQJSON_objectGetInt64(json, "timeoutMs", &timeoutMs))
    NQHttpRequest_setTimeoutMs(httpRequest, NQGetClamp(timeoutMs, RESTBOX_TIMEOUT_MS_MIN, RESTBOX_TIMEOUT_MS_MAX));

  const char* body = NULL;
  if (NQJSON_objectGetString(json, "body", &body) && body != NULL
      && !NQIsHttpGetMethod(method) && !NQIsHttpHeadMethod(method)) {
    if (!NQHttpRequest_setPostData(httpRequest, body, strlen(body)))
      return writeError(response, NQ_HTTP_INTERNAL_SERVER_ERROR, NULL, "Unable to attach the request body");
  }

  NQ_LOGI("proxying %s %s", method, url);

  int ret = NQHttpRequest_performSync(httpRequest);
  if (ret != 0) {
    const char* detail = NQHttpRequest_lastErrorMessage(httpRequest);
    NQ_LOGW("upstream %s %s failed (%d): %s", method, url, ret, detail != NULL ? detail : "unknown error");
    return writeError(response, NQ_HTTP_BAD_GATEWAY, "network", detail != NULL ? detail : "Could not reach the target host");
  }

  return writeSendResult(httpRequest, upstreamBody, response);
}

static int requestSendInit(NQWebRequest* request, void* data)
{
  NQ_UNUSED_PARAM(data);

  NQByteBuffer* postBuffer = (NQByteBuffer*)NQMalloc(sizeof(*postBuffer));
  if (postBuffer == NULL)
    return -NQ_ENOMEM;

  NQByteBuffer_init(postBuffer);
  request->userdata = postBuffer;
  return 0;
}

static size_t requestSendReceive(NQWebRequest* request, const char* data, size_t size)
{
  NQByteBuffer* postBuffer = (NQByteBuffer*)request->userdata;
  if (!NQByteBuffer_append(postBuffer, (const uint8_t*)data, size))
    return 0;
  return size;
}

static int requestSendHandler(NQWebRequest* request, NQWebResponse* response)
{
  NQByteBuffer* postBuffer = (NQByteBuffer*)request->userdata;

  NQWebResponse_setHeader(response, NQHTTP_HEADER_CONTENT_TYPE, NQ_MEDIATYPE_APPLICATION_JSON);

  if (postBuffer == NULL || NQByteBuffer_isEmpty(postBuffer)) {
    NQ_LOGW(RESTBOX_SERVICE_URL " called with an empty body");
    return writeError(response, NQ_HTTP_BAD_REQUEST, NULL, "Request body is empty");
  }

  NQJSON* json = NQJSON_parse2((const char*)NQByteBuffer_data(postBuffer), NQByteBuffer_size(postBuffer));
  if (json == NULL) {
    NQ_LOGW(RESTBOX_SERVICE_URL " received a malformed JSON body");
    return writeError(response, NQ_HTTP_BAD_REQUEST, NULL, "Request body is not valid JSON");
  }

  NQByteBuffer upstreamBody;
  NQByteBuffer_init(&upstreamBody);

  NQHttpRequest* httpRequest = NQHttpRequest_create(&upstreamBodyWrite, &upstreamBody);
  if (httpRequest == NULL) {
    NQ_LOGE("NQHttpRequest_create failed");
    NQByteBuffer_finalize(&upstreamBody);
    NQJSON_release(json);
    return writeError(response, NQ_HTTP_INTERNAL_SERVER_ERROR, NULL, "Out of resources");
  }

  int status = proxySend(json, httpRequest, &upstreamBody, response);

  NQHttpRequest_release(httpRequest);
  NQByteBuffer_finalize(&upstreamBody);
  NQJSON_release(json);
  return status;
}

static void requestSendRelease(NQWebRequest* request)
{
  NQByteBuffer* postBuffer = (NQByteBuffer*)request->userdata;
  if (postBuffer == NULL)
    return;
  NQByteBuffer_finalize(postBuffer);
  NQFree(postBuffer);
  request->userdata = NULL;
}

static const NQWebRequestOperations kSendOps = {
  .init = requestSendInit,
  .receive = requestSendReceive,
  .handler = requestSendHandler,
  .release = requestSendRelease,
};

static int executorInit(NQWebExecutor* executor, void* data)
{
  NQ_UNUSED_PARAM(data);

  struct WebRestboxExecutor* restbox = (struct WebRestboxExecutor*)executor;

  NQLibraryInfo info;
  int ret = NQLibraryInfoLoad(&info, &executorInit);
  if (ret != 0)
    return ret;

  NQPath* manifest = NQPath_join3(info.filename, "../../" RESTBOX_ASSETS_DIR, NQ_WEBMANIFEST_FILE);
  NQLibraryInfoFinalize(&info);
  if (manifest == NULL) {
    return -NQ_ENOMEM;
  }

  ret = NQWebManifestListenersInit(executor, &restbox->manifestListeners, NQPath_characters(manifest));
  NQPath_destroy(manifest);
  if (ret != 0) {
    return ret;
  }

  ret = NQWebExecutor_addRequestListener(&restbox->executor, &restbox->sendListener, &kSendOps, restbox, NQ_HTTP_POST, RESTBOX_SERVICE_URL);
  if (ret != 0) {
    NQWebManifestListenersFinalize(&restbox->executor, &restbox->manifestListeners);
    return ret;
  }

  return ret;
}

static void executorRelease(NQWebExecutor* executor)
{
  struct WebRestboxExecutor* restbox = (struct WebRestboxExecutor*)executor;
  NQWebExecutor_removeRequestListener(&restbox->executor, &restbox->sendListener);
  NQWebManifestListenersFinalize(&restbox->executor, &restbox->manifestListeners);
}

static struct NQWebExecutorOperations s_executorOps = {
  .name = "restbox",
  .init = executorInit,
  .release = executorRelease,
  .size = sizeof(struct WebRestboxExecutor),
};

static int moduleInit(NQContext* context)
{
  NQWebExecutorRegister(&s_executorOps);
  return 0;
}

static void moduleExit(NQContext* context)
{
  NQWebExecutorUnregister(&s_executorOps);
}

NQ_MODULE_INIT(moduleInit);
NQ_MODULE_EXIT(moduleExit);
