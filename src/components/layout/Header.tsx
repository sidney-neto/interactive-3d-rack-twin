import { Icon } from "./Icon";

export function Header() {
  return (
    <header className="app-header">
      <div className="brand-mark">
        <Icon name="cube" size={27} />
      </div>
      <div className="brand">
        <h1>Interactive 3D Rack Twin</h1>
        <p>Interactive 3D Infrastructure Digital Twin Viewer</p>
      </div>
      <div className="header-divider" />
      <span className="workspace-label">Infrastructure lab</span>
      <div className="header-meta">
        <span className="environment-badge">
          <i />
          MVP · STATIC DATA
        </span>
        <span className="version-label">v0.1</span>
      </div>
    </header>
  );
}
