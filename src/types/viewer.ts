export type ViewerMode = "rack" | "server" | "component" | "exploded";
export type CameraMode = "free" | "front" | "rear" | "focus";
export interface ServerViewState {
  bezelRemoved: boolean;
  extracted: boolean;
  open: boolean;
  exploded: boolean;
}
export type ViewerPhase =
  | "RACK_VIEW"
  | "SERVER_SELECTED"
  | "SERVER_EXTRACTED"
  | "SERVER_OPEN"
  | "COMPONENT_SELECTED"
  | "EXPLODED_VIEW";
