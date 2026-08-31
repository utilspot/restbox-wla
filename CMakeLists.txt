cmake_minimum_required(VERSION 3.13)
project(restbox-wla VERSION 1.0.0 LANGUAGES C)

include(GNUInstallDirs)

find_program(NPM_EXECUTABLE npm REQUIRED)
mark_as_advanced(NPM_EXECUTABLE)

if (WIN32)
  set(NPM_PREFIX "cmd" "/c")
endif ()

find_package(LibNetQ REQUIRED)

option(RESTBOX_INSTALL_SERVER "Install the restbox server" ON)
option(RESTBOX_INSTALL_MODULE "Install the restbox module" ON)
option(RESTBOX_INSTALL_ASSETS "Install restbox supporting assets" ON)

set(RESTBOX_BASE_URL "/" CACHE STRING "URL path prefix the restbox module is served under (a trailing slash is appended if missing)")
set(RESTBOX_ROOT_URL "${RESTBOX_BASE_URL}")
if(NOT RESTBOX_ROOT_URL MATCHES "/$")
  set(RESTBOX_ROOT_URL "${RESTBOX_ROOT_URL}/")
endif()

set(RESTBOX_START_URL "" CACHE STRING "URL a fresh request draft starts with; empty uses the page's own origin")
set(RESTBOX_SERVICE_URL "${RESTBOX_ROOT_URL}send")
set(RESTBOX_ASSETS_DIR "${CMAKE_INSTALL_DATADIR}/${PROJECT_NAME}")

set(RESTBOX_DATAFILES
  config.h.in
  )

file(GLOB_RECURSE RESTBOX_TSXFILES
  "src/*.ts"
  "src/*.tsx"
  )

set(RESTBOX_DISTFILES
  dist/index.html
  dist/manifest.json
  )

add_custom_command(
  COMMAND ${NPM_PREFIX} "${NPM_EXECUTABLE}" install
  COMMAND ${NPM_PREFIX} "${NPM_EXECUTABLE}" run build --base-url=${RESTBOX_BASE_URL} --start-url=${RESTBOX_START_URL}
  DEPENDS package.json ${RESTBOX_TSXFILES}
  OUTPUT ${RESTBOX_DISTFILES}
  WORKING_DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}"
  )

configure_file(config.h.in "${CMAKE_CURRENT_BINARY_DIR}/config.h" @ONLY)

source_group(TREE "${CMAKE_CURRENT_SOURCE_DIR}" FILES module.c ${RESTBOX_DATAFILES} ${RESTBOX_DISTFILES})
add_library(restbox_wla SHARED module.c ${RESTBOX_DATAFILES} ${RESTBOX_DISTFILES})
target_include_directories(restbox_wla PRIVATE "$<BUILD_INTERFACE:${CMAKE_CURRENT_BINARY_DIR}>")
target_link_libraries(restbox_wla PUBLIC LibNetQ::LibNetQ)
set_property(TARGET restbox_wla PROPERTY POSITION_INDEPENDENT_CODE ON)
set_target_properties(restbox_wla PROPERTIES PREFIX "" IMPORT_PREFIX "")

source_group(TREE "${CMAKE_CURRENT_SOURCE_DIR}" FILES server.c)
add_executable(restbox_server server.c)
target_link_libraries(restbox_server PRIVATE LibNetQ::LibNetQ)

if (CMAKE_C_COMPILER_ID MATCHES "^(GNU|Clang)$")
  target_link_options(restbox_server PRIVATE "-Wl,-rpath,$ORIGIN/../lib" "-Wl,--disable-new-dtags")
endif ()

if (RESTBOX_INSTALL_SERVER)
  install(TARGETS restbox_server
    RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    )
endif ()

if (RESTBOX_INSTALL_MODULE)
  install(TARGETS restbox_wla
    LIBRARY DESTINATION ${CMAKE_INSTALL_BINDIR}
    ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}
    )
endif ()

if (RESTBOX_INSTALL_ASSETS)
  install(DIRECTORY "${CMAKE_CURRENT_SOURCE_DIR}/dist/"
    DESTINATION "${RESTBOX_ASSETS_DIR}"
    )
endif ()
