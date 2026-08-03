import vimNavConfig from './examples/vim-nav.conf?raw';
import homerowModsConfig from './examples/homerow-mods.conf?raw';
import chordsConfig from './examples/chords.conf?raw';
import dvorakLayoutConfig from './examples/dvorak-layout.conf?raw';

// Types for WASM binding interface
interface KeydoWasm {
  parse_config(text: string): any;
  create_keyboard(config: any): any;
  process_events(kbd: any, eventsJson: string): string;
  reset_keyboard(kbd: any): void;
  get_layer_state(kbd: any): string;
}

interface OutputEvent {
  code: number;
  name: string;
  pressed: number;
}

interface LayerInfo {
  name: string;
  active: boolean;
}

interface ProcessResult {
  output: OutputEvent[];
  layers: LayerInfo[];
  next_timeout_ms: number;
  error?: string;
}

const EXAMPLES: Record<string, string> = {
  'vim-nav': vimNavConfig,
  'homerow-mods': homerowModsConfig,
  'chords': chordsConfig,
  'dvorak-layout': dvorakLayoutConfig,
};

// Map from standard W3C KeyboardEvent.code -> keydo linux/evdev keycode
const DOM_CODE_TO_KEYDO: Record<string, number> = {
  'Escape': 1,
  'Digit1': 2, 'Digit2': 3, 'Digit3': 4, 'Digit4': 5, 'Digit5': 6,
  'Digit6': 7, 'Digit7': 8, 'Digit8': 9, 'Digit9': 10, 'Digit0': 11,
  'Minus': 12, 'Equal': 13, 'Backspace': 14, 'Tab': 15,
  'KeyQ': 16, 'KeyW': 17, 'KeyE': 18, 'KeyR': 19, 'KeyT': 20,
  'KeyY': 21, 'KeyU': 22, 'KeyI': 23, 'KeyO': 24, 'KeyP': 25,
  'BracketLeft': 26, 'BracketRight': 27, 'Enter': 28, 'ControlLeft': 29,
  'KeyA': 30, 'KeyS': 31, 'KeyD': 32, 'KeyF': 33, 'KeyG': 34,
  'KeyH': 35, 'KeyJ': 36, 'KeyK': 37, 'KeyL': 38, 'Semicolon': 39,
  'Quote': 40, 'Backquote': 41, 'ShiftLeft': 42, 'Backslash': 43,
  'KeyZ': 44, 'KeyX': 45, 'KeyC': 46, 'KeyV': 47, 'KeyB': 48,
  'KeyN': 49, 'KeyM': 50, 'Comma': 51, 'Period': 52, 'Slash': 53,
  'ShiftRight': 54, 'NumpadMultiply': 55, 'AltLeft': 56, 'Space': 57,
  'CapsLock': 58, 'F1': 59, 'F2': 60, 'F3': 61, 'F4': 62, 'F5': 63,
  'F6': 64, 'F7': 65, 'F8': 66, 'F9': 67, 'F10': 68,
  'ControlRight': 97, 'AltRight': 100, 'Home': 102, 'ArrowUp': 103,
  'PageUp': 104, 'ArrowLeft': 105, 'ArrowRight': 106, 'End': 107,
  'ArrowDown': 108, 'PageDown': 109, 'Insert': 110, 'Delete': 111,
  'MetaLeft': 125, 'MetaRight': 126,
};

// Keyboard layout definition (QWERTY)
const KEYBOARD_ROWS = [
  [
    { code: 41, label: '`', codeName: 'grave' },
    { code: 2, label: '1', codeName: '1' },
    { code: 3, label: '2', codeName: '2' },
    { code: 4, label: '3', codeName: '3' },
    { code: 5, label: '4', codeName: '4' },
    { code: 6, label: '5', codeName: '5' },
    { code: 7, label: '6', codeName: '6' },
    { code: 8, label: '7', codeName: '7' },
    { code: 9, label: '8', codeName: '8' },
    { code: 10, label: '9', codeName: '9' },
    { code: 11, label: '0', codeName: '0' },
    { code: 12, label: '-', codeName: 'minus' },
    { code: 13, label: '=', codeName: 'equal' },
    { code: 14, label: 'Backspace', class: 'key-wide', codeName: 'backspace' },
  ],
  [
    { code: 15, label: 'Tab', class: 'key-wide', codeName: 'tab' },
    { code: 16, label: 'Q', codeName: 'q' },
    { code: 17, label: 'W', codeName: 'w' },
    { code: 18, label: 'E', codeName: 'e' },
    { code: 19, label: 'R', codeName: 'r' },
    { code: 20, label: 'T', codeName: 't' },
    { code: 21, label: 'Y', codeName: 'y' },
    { code: 22, label: 'U', codeName: 'u' },
    { code: 23, label: 'I', codeName: 'i' },
    { code: 24, label: 'O', codeName: 'o' },
    { code: 25, label: 'P', codeName: 'p' },
    { code: 26, label: '[', codeName: 'leftbrace' },
    { code: 27, label: ']', codeName: 'rightbrace' },
    { code: 43, label: '\\', codeName: 'backslash' },
  ],
  [
    { code: 58, label: 'Caps Lock', class: 'key-extra-wide', codeName: 'capslock' },
    { code: 30, label: 'A', codeName: 'a' },
    { code: 31, label: 'S', codeName: 's' },
    { code: 32, label: 'D', codeName: 'd' },
    { code: 33, label: 'F', codeName: 'f' },
    { code: 34, label: 'G', codeName: 'g' },
    { code: 35, label: 'H', codeName: 'h' },
    { code: 36, label: 'J', codeName: 'j' },
    { code: 37, label: 'K', codeName: 'k' },
    { code: 38, label: 'L', codeName: 'l' },
    { code: 39, label: ';', codeName: 'semicolon' },
    { code: 40, label: "'", codeName: 'apostrophe' },
    { code: 28, label: 'Enter', class: 'key-extra-wide', codeName: 'enter' },
  ],
  [
    { code: 42, label: 'Shift', class: 'key-extra-wide', codeName: 'leftshift' },
    { code: 44, label: 'Z', codeName: 'z' },
    { code: 45, label: 'X', codeName: 'x' },
    { code: 46, label: 'C', codeName: 'c' },
    { code: 47, label: 'V', codeName: 'v' },
    { code: 48, label: 'B', codeName: 'b' },
    { code: 49, label: 'N', codeName: 'n' },
    { code: 50, label: 'M', codeName: 'm' },
    { code: 51, label: ',', codeName: 'comma' },
    { code: 52, label: '.', codeName: 'dot' },
    { code: 53, label: '/', codeName: 'slash' },
    { code: 54, label: 'Shift', class: 'key-extra-wide', codeName: 'rightshift' },
  ],
  [
    { code: 29, label: 'Ctrl', class: 'key-wide', codeName: 'leftcontrol' },
    { code: 56, label: 'Alt', class: 'key-wide', codeName: 'leftalt' },
    { code: 125, label: 'Meta', class: 'key-wide', codeName: 'leftmeta' },
    { code: 57, label: 'Space', class: 'key-space', codeName: 'space' },
    { code: 126, label: 'Meta', class: 'key-wide', codeName: 'rightmeta' },
    { code: 100, label: 'AltGr', class: 'key-wide', codeName: 'rightalt' },
    { code: 97, label: 'Ctrl', class: 'key-wide', codeName: 'rightcontrol' },
  ]
];

class PlaygroundApp {
  private wasm!: KeydoWasm;
  private currentKbd: any = null;
  private startTime = Date.now();
  private debounceTimer: number | null = null;
  private chordTimeoutTimer: number | null = null;
  private heldPhysicalKeys = new Set<string>();

  // UI Elements
  private editor = document.getElementById('config-editor') as HTMLTextAreaElement;
  private testInputBox = document.getElementById('test-input-box') as HTMLInputElement;
  private statusIndicator = document.getElementById('config-status') as HTMLDivElement;
  private errorBanner = document.getElementById('editor-error-banner') as HTMLDivElement;
  private layerBadges = document.getElementById('layer-badges') as HTMLDivElement;
  private eventLog = document.getElementById('event-log') as HTMLDivElement;
  private exampleSelect = document.getElementById('example-select') as HTMLSelectElement;
  private resetBtn = document.getElementById('btn-reset-state') as HTMLButtonElement;
  private clearLogBtn = document.getElementById('btn-clear-log') as HTMLButtonElement;
  private keyboardContainer = document.getElementById('virtual-keyboard') as HTMLDivElement;

  async init() {
    try {
      // @ts-ignore
      const wasmModule = await import('./wasm/keydo_wasm.js');
      await wasmModule.default();
      this.wasm = wasmModule;

      this.renderVirtualKeyboard();
      this.bindEvents();
      this.bindPhysicalKeyListeners();

      // Load default example
      this.editor.value = EXAMPLES['vim-nav'];
      this.rebuildKeyboard();
    } catch (err: any) {
      this.showError('Failed to initialize WebAssembly engine: ' + err.message);
    }
  }

  private renderVirtualKeyboard() {
    const layoutEl = document.createElement('div');
    layoutEl.className = 'kb-layout';

    KEYBOARD_ROWS.forEach(row => {
      const rowEl = document.createElement('div');
      rowEl.className = 'kb-row';

      row.forEach(key => {
        const keyEl = document.createElement('button');
        keyEl.className = `kb-key ${key.class || ''}`;
        keyEl.dataset.code = key.code.toString();
        keyEl.innerHTML = `
          <span class="key-label">${key.label}</span>
          <span class="key-code">${key.codeName}</span>
        `;

        // Mouse press handlers
        keyEl.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.handleKeyEvent(key.code, 1);
          keyEl.classList.add('pressed');
        });

        keyEl.addEventListener('mouseup', (e) => {
          e.preventDefault();
          this.handleKeyEvent(key.code, 0);
          keyEl.classList.remove('pressed');
        });

        keyEl.addEventListener('mouseleave', () => {
          if (keyEl.classList.contains('pressed')) {
            this.handleKeyEvent(key.code, 0);
            keyEl.classList.remove('pressed');
          }
        });

        rowEl.appendChild(keyEl);
      });

      layoutEl.appendChild(rowEl);
    });

    this.keyboardContainer.appendChild(layoutEl);
  }

  private bindEvents() {
    // Debounced config editor parsing
    this.editor.addEventListener('input', () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => this.rebuildKeyboard(), 300);
    });

    // Example selector
    this.exampleSelect.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      if (EXAMPLES[val]) {
        this.editor.value = EXAMPLES[val];
        this.rebuildKeyboard();
      }
    });

    // Reset button
    this.resetBtn.addEventListener('click', () => {
      if (this.currentKbd) {
        this.clearChordTimeout();
        this.wasm.reset_keyboard(this.currentKbd);
        this.heldPhysicalKeys.clear();
        this.clearVisualPressedKeys();
        this.updateLayerBadges([]);
        this.appendLogNotice('Keyboard state reset.');
      }
    });

    // Clear log button
    this.clearLogBtn.addEventListener('click', () => {
      this.eventLog.innerHTML = '<div class="log-empty">Log cleared.</div>';
    });
  }

  private bindPhysicalKeyListeners() {
    window.addEventListener('keydown', (e) => {
      // Do not capture physical key events when typing inside the config editor textarea
      if (document.activeElement === this.editor) {
        return;
      }

      const keydoCode = DOM_CODE_TO_KEYDO[e.code];
      if (keydoCode !== undefined) {
        // Prevent default browser behavior (tab focus, space scroll, etc.) when testing keys
        e.preventDefault();

        if (!this.heldPhysicalKeys.has(e.code)) {
          this.heldPhysicalKeys.add(e.code);
          this.handleKeyEvent(keydoCode, 1);
          this.setVisualKeyState(keydoCode, true);
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (document.activeElement === this.editor) {
        return;
      }

      const keydoCode = DOM_CODE_TO_KEYDO[e.code];
      if (keydoCode !== undefined) {
        e.preventDefault();
        this.heldPhysicalKeys.delete(e.code);
        this.handleKeyEvent(keydoCode, 0);
        this.setVisualKeyState(keydoCode, false);
      }
    });
  }

  private setVisualKeyState(code: number, pressed: boolean) {
    const keyEl = this.keyboardContainer.querySelector(`.kb-key[data-code="${code}"]`);
    if (keyEl) {
      if (pressed) {
        keyEl.classList.add('pressed');
      } else {
        keyEl.classList.remove('pressed');
      }
    }
  }

  private clearVisualPressedKeys() {
    const keys = this.keyboardContainer.querySelectorAll('.kb-key.pressed');
    keys.forEach(k => k.classList.remove('pressed'));
  }

  private rebuildKeyboard() {
    this.clearChordTimeout();
    const text = this.editor.value;
    try {
      const config = this.wasm.parse_config(text);
      this.currentKbd = this.wasm.create_keyboard(config);

      this.setStatus('Ready', 'success');
      this.hideError();

      // Read current layers
      const rawLayers = this.wasm.get_layer_state(this.currentKbd);
      const layers: LayerInfo[] = JSON.parse(rawLayers);
      this.updateLayerBadges(layers);
    } catch (err: any) {
      this.setStatus('Syntax Error', 'danger');
      this.showError(err.toString());
    }
  }

  private handleKeyEvent(code: number, pressed: number) {
    const timestamp = Date.now() - this.startTime;
    this.processEvents([{ code, pressed, timestamp }]);
  }

  private clearChordTimeout() {
    if (this.chordTimeoutTimer !== null) {
      clearTimeout(this.chordTimeoutTimer);
      this.chordTimeoutTimer = null;
    }
  }

  // Pending chords (and overloads/oneshots) resolve on elapsed time as much as
  // on key events. The wasm state machine can only detect that elapsed time
  // via a synthetic code=0 "tick" event, so next_timeout_ms tells us when to
  // feed it one if no real key event arrives first.
  private processEvents(events: { code: number; pressed: number; timestamp: number }[]) {
    if (!this.currentKbd) return;

    this.clearChordTimeout();

    const rawRes = this.wasm.process_events(this.currentKbd, JSON.stringify(events));
    const res: ProcessResult = JSON.parse(rawRes);

    if (res.output) {
      res.output.forEach(ev => this.appendLogEvent(ev));
    }

    if (res.layers) {
      this.updateLayerBadges(res.layers);
    }

    if (res.next_timeout_ms > 0) {
      this.chordTimeoutTimer = window.setTimeout(() => {
        this.chordTimeoutTimer = null;
        const tickTimestamp = Date.now() - this.startTime;
        this.processEvents([{ code: 0, pressed: 0, timestamp: tickTimestamp }]);
      }, res.next_timeout_ms);
    }
  }

  private updateLayerBadges(layers: LayerInfo[]) {
    this.layerBadges.innerHTML = '';
    layers.forEach(l => {
      const badge = document.createElement('span');
      badge.className = `layer-badge ${l.active ? 'active' : ''}`;
      badge.textContent = l.name;
      this.layerBadges.appendChild(badge);
    });
  }

  private appendLogEvent(ev: OutputEvent) {
    const emptyNotice = this.eventLog.querySelector('.log-empty');
    if (emptyNotice) emptyNotice.remove();

    const item = document.createElement('div');
    const stateStr = ev.pressed === 1 ? 'DOWN' : 'UP';
    item.className = `log-item ${stateStr.toLowerCase()}`;

    item.innerHTML = `
      <span class="event-name">${ev.pressed === 1 ? '↓' : '↑'} ${ev.name} (code ${ev.code})</span>
      <span class="event-state">${stateStr}</span>
    `;

    this.eventLog.appendChild(item);
    this.eventLog.scrollTop = this.eventLog.scrollHeight;
  }

  private appendLogNotice(msg: string) {
    const emptyNotice = this.eventLog.querySelector('.log-empty');
    if (emptyNotice) emptyNotice.remove();

    const item = document.createElement('div');
    item.className = 'log-item';
    item.style.borderLeftColor = 'var(--accent)';
    item.innerHTML = `<span class="event-name">ℹ️ ${msg}</span>`;

    this.eventLog.appendChild(item);
    this.eventLog.scrollTop = this.eventLog.scrollHeight;
  }

  private setStatus(text: string, type: 'success' | 'danger' | 'warning') {
    this.statusIndicator.innerHTML = `<span class="dot dot-${type}"></span> ${text}`;
  }

  private showError(msg: string) {
    this.errorBanner.textContent = msg;
    this.errorBanner.classList.remove('hidden');
  }

  private hideError() {
    this.errorBanner.classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new PlaygroundApp();
  app.init();
});
