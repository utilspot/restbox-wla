export interface TabItem {
  id: string;
  label: string;
  badge?: number;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
}

export function Tabs({ tabs, active, onChange }: TabsProps) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          className={`tab${tab.id === active ? ' tab--active' : ''}`}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
          {tab.badge ? <span className="tab__badge">{tab.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
