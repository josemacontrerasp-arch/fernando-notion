import { flushEditors } from "../lib/persist";
import { openPage, toast } from "../lib/store";
import { TEMPLATES } from "../lib/templates";

export function TemplatesView() {
  return (
    <div className="simple-page wide">
      <h1 className="sp-title">Templates</h1>
      <p className="muted">Start from a ready-made page. Everything can be customised afterwards.</p>
      <div className="tpl-grid">
        {TEMPLATES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="tpl-card"
            onClick={() => {
              flushEditors();
              const id = t.create(null);
              openPage(id);
              toast(`Added “${t.name}”`);
            }}
          >
            <span className="tpl-icon">{t.icon}</span>
            <span className="tpl-name">{t.name}</span>
            <span className="tpl-desc">{t.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
