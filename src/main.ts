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

  // UI Elements
  private editor = document.getElementById('config-editor') as HTMLTextAreaElement;
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
        this.wasm.reset_keyboard(this.currentKbd);
        this.updateLayerBadges([]);
        this.appendLogNotice('Keyboard state reset.');
      }
    });

    // Clear log button
    this.clearLogBtn.addEventListener('click', () => {
      this.eventLog.innerHTML = '<div class="log-empty">Log cleared.</div>';
    });
  }

  private rebuildKeyboard() {
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
    if (!this.currentKbd) return;

    const timestamp = Date.now() - this.startTime;
    const events = [{ code, pressed, timestamp }];

    const rawRes = this.wasm.process_events(this.currentKbd, JSON.stringify(events));
    const res: ProcessResult = JSON.parse(rawRes);

    if (res.output) {
      res.output.forEach(ev => this.appendLogEvent(ev));
    }

    if (res.layers) {
      this.updateLayerBadges(res.layers);
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
