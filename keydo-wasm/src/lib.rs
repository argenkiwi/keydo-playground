//! WASM bindings for the keydo keyboard remapping engine.
//!
//! Exposes three high-level functions to JavaScript:
//! - `parse_config(text)` — parse a keydo `.conf` string, returns a handle
//! - `create_keyboard(config)` — create a running state machine
//! - `process_events(kbd, events_json)` — step the state machine, return JSON output

use wasm_bindgen::prelude::*;
use serde::{Deserialize, Serialize};

use keydo::config::Config;
use keydo::config_impl::config_parse_string;
use keydo::config_validate::{validate, Severity};
use keydo::keyboard_types::{KeyEvent as KbdKeyEvent, Keyboard, Output};
use keydo::keys::KEYCODE_TABLE;

// ── Public output types (serialised to JSON for JS) ──────────────────────────

#[derive(Serialize)]
struct OutputEvent {
    code: u8,
    name: String,
    pressed: u8,
}

#[derive(Serialize)]
struct LayerInfo {
    name: String,
    active: bool,
}

#[derive(Serialize)]
struct ProcessResult {
    output: Vec<OutputEvent>,
    layers: Vec<LayerInfo>,
    next_timeout_ms: i64,
}

#[derive(Deserialize)]
struct InputEvent {
    code: u8,
    pressed: u8,
    timestamp: i32,
}

// ── WasmOutput — Output sink that buffers events for JSON serialisation ───────

struct WasmOutput {
    events: Vec<OutputEvent>,
    layers: Vec<LayerInfo>,
}

impl WasmOutput {
    fn new(layer_names: Vec<String>) -> Self {
        Self {
            events: Vec::new(),
            layers: layer_names
                .into_iter()
                .map(|name| LayerInfo { name, active: false })
                .collect(),
        }
    }
}

impl Output for WasmOutput {
    fn send_key(&mut self, code: u8, state: u8) {
        let name = KEYCODE_TABLE
            .get(code as usize)
            .and_then(|e| e.name)
            .unwrap_or("unknown")
            .to_string();
        self.events.push(OutputEvent { code, name, pressed: state });
    }

    fn on_layer_change(&mut self, _kbd: &Keyboard, layer_idx: usize, active: u8) {
        if let Some(layer) = self.layers.get_mut(layer_idx) {
            layer.active = active != 0;
        }
    }
}

// ── Opaque handles exposed to JS ──────────────────────────────────────────────

/// A parsed keydo configuration. Opaque to JavaScript.
#[wasm_bindgen]
pub struct KeydoConfig {
    inner: Config,
}

/// A running keyboard state machine. Opaque to JavaScript.
#[wasm_bindgen]
pub struct KeydoKeyboard {
    inner: Keyboard,
    layer_names: Vec<String>,
}

// ── Exported functions ────────────────────────────────────────────────────────

/// Parse a keydo configuration string.
///
/// Returns `Ok(KeydoConfig)` on success, or a `JsValue` string error on failure.
#[wasm_bindgen]
pub fn parse_config(text: &str) -> Result<KeydoConfig, JsValue> {
    let mut config = Config::new();

    config_parse_string(&mut config, text)
        .map_err(|e| JsValue::from_str(&e.to_string()))?;

    // Semantic validation
    let errors: Vec<_> = validate(&config)
        .into_iter()
        .filter(|ve| matches!(ve.severity, Severity::Error))
        .collect();

    if !errors.is_empty() {
        let msg = errors.iter().map(|e| e.message.as_str()).collect::<Vec<_>>().join("; ");
        return Err(JsValue::from_str(&msg));
    }

    Ok(KeydoConfig { inner: config })
}

/// Create a keyboard state machine from a parsed config.
#[wasm_bindgen]
pub fn create_keyboard(config: KeydoConfig) -> KeydoKeyboard {
    let layer_names: Vec<String> = config.inner.layers.iter().map(|l| l.name.clone()).collect();
    let keyboard = Keyboard::new(config.inner);
    KeydoKeyboard { inner: keyboard, layer_names }
}

/// Process a batch of input key events.
///
/// `events_json` must be a JSON array of `{code, pressed, timestamp}` objects.
///
/// Returns a JSON string with shape:
/// ```json
/// {
///   "output": [{"code": 30, "name": "a", "pressed": 1}, ...],
///   "layers": [{"name": "main", "active": true}, ...],
///   "next_timeout_ms": -1
/// }
/// ```
#[wasm_bindgen]
pub fn process_events(kbd: &mut KeydoKeyboard, events_json: &str) -> String {
    let input: Vec<InputEvent> = match serde_json::from_str(events_json) {
        Ok(v) => v,
        Err(e) => {
            return serde_json::to_string(&serde_json::json!({
                "error": e.to_string()
            }))
            .unwrap_or_default();
        }
    };

    let raw_events: Vec<KbdKeyEvent> = input
        .into_iter()
        .map(|e| KbdKeyEvent { code: e.code, pressed: e.pressed, timestamp: e.timestamp })
        .collect();

    // Snapshot current layer state before processing so WasmOutput is initialised
    // with all layers from the keyboard's config.
    let layer_names = kbd.layer_names.clone();
    let mut output = WasmOutput::new(layer_names);

    // Seed the layer active state from current keyboard state before processing
    for (i, layer_info) in output.layers.iter_mut().enumerate() {
        if i < keydo::config::MAX_LAYERS {
            layer_info.active = kbd.inner.layer_state[i].active != 0;
        }
    }

    let next_timeout = kbd.inner.kbd_process_events(&mut output, &raw_events);

    let result = ProcessResult {
        output: output.events,
        layers: output.layers,
        next_timeout_ms: next_timeout,
    };

    serde_json::to_string(&result).unwrap_or_default()
}

/// Return a JSON array of all valid key names recognised by keydo.
///
/// Used by the frontend for autocomplete and the virtual keyboard.
#[wasm_bindgen]
pub fn list_keys() -> String {
    let keys: Vec<serde_json::Value> = KEYCODE_TABLE
        .iter()
        .enumerate()
        .filter_map(|(i, ent)| {
            ent.name.map(|name| {
                serde_json::json!({
                    "code": i,
                    "name": name,
                    "alt_name": ent.alt_name,
                    "shifted_name": ent.shifted_name,
                })
            })
        })
        .collect();

    serde_json::to_string(&keys).unwrap_or_default()
}

/// Reset the keyboard state machine (release all layers and held keys).
#[wasm_bindgen]
pub fn reset_keyboard(kbd: &mut KeydoKeyboard) {
    let layer_names = kbd.layer_names.clone();
    let mut output = WasmOutput::new(layer_names);
    kbd.inner.kbd_process_events(&mut output, &[]);
}

/// Return the current layer states as a JSON string.
/// Shape: `[{"name": "main", "active": true}, ...]`
#[wasm_bindgen]
pub fn get_layer_state(kbd: &KeydoKeyboard) -> String {
    let layers: Vec<LayerInfo> = kbd
        .layer_names
        .iter()
        .enumerate()
        .map(|(i, name)| LayerInfo {
            name: name.clone(),
            active: i < keydo::config::MAX_LAYERS && kbd.inner.layer_state[i].active != 0,
        })
        .collect();

    serde_json::to_string(&layers).unwrap_or_default()
}
