import { Palette } from '../models/palette';

/** Opaque, contrasting pointer states override the Horizon prefab's pale defaults. */
export class ControlStyle {
  static properties(selected = false) {
    const ui = Palette.ui, background = selected ? ui.control : ui.surface;
    const focus = selected ? ui['on-control'] : ui.focus;
    return {
      backgroundColor: background, backgroundOpacity: 1, borderColor: selected ? focus : ui.border, borderWidth: 0.08,
      hover: { backgroundColor: background, borderColor: focus, borderWidth: 0.12 },
      active: { backgroundColor: background, borderColor: focus, borderWidth: 0.18 },
    };
  }
}
