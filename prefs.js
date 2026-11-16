import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

// Number of display modes supported by extension.js (0 .. MODE_COUNT - 1)
const MODE_COUNT = 8;

export default class HardDiskLEDPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings; // keep a reference for the window lifetime

        const builder = new Gtk.Builder();
        builder.set_translation_domain(this.metadata['gettext-domain'] ?? this.metadata.uuid);
        builder.add_from_file(`${this.path}/ui/prefs.ui`);

        const rowMode = builder.get_object('row_mode');
        const rowDefaultMode = builder.get_object('row_defaultmode');

        // mode: combo index == mode
        this._bindCombo(settings, 'mode', rowMode,
            value => Math.min(Math.max(value, 0), MODE_COUNT - 1),
            index => index);

        // defaultmode: index 0 == "None" (-1), index n == mode n - 1
        this._bindCombo(settings, 'defaultmode', rowDefaultMode,
            value => (value < 0 || value >= MODE_COUNT) ? 0 : value + 1,
            index => index - 1);

        window.set_default_size(560, 380);
        window.add(builder.get_object('page_general'));
    }

    _bindCombo(settings, key, row, toIndex, fromIndex) {
        row.set_selected(toIndex(settings.get_int(key)));

        row.connect('notify::selected', () => {
            const value = fromIndex(row.get_selected());
            if (settings.get_int(key) !== value)
                settings.set_int(key, value);
        });

        const id = settings.connect(`changed::${key}`, () => {
            const index = toIndex(settings.get_int(key));
            if (row.get_selected() !== index)
                row.set_selected(index);
        });
        row.connect('destroy', () => settings.disconnect(id));
    }
}
