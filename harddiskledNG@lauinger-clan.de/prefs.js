import Gdk from "gi://Gdk";
import Gtk from "gi://Gtk";
import { ExtensionPreferences } from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class HardDiskLEDNGPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings; // keep a reference for the window lifetime

        const builder = new Gtk.Builder();
        builder.set_translation_domain(this.metadata["gettext-domain"]);
        builder.add_from_file(`${this.path}/ui/prefs.ui`);

        const rowMode = builder.get_object("row_mode");
        const rowDefaultMode = builder.get_object("row_defaultmode");

        // the schema ranges keep both keys within the combo rows' items
        // mode: combo index == mode
        this._bindCombo(
            settings,
            "mode",
            rowMode,
            (value) => value,
            (index) => index
        );

        // defaultmode: index 0 == "None" (-1), index n == mode n - 1
        this._bindCombo(
            settings,
            "defaultmode",
            rowDefaultMode,
            (value) => value + 1,
            (index) => index - 1
        );

        this._bindColor(
            settings,
            "led-color",
            builder.get_object("button_ledcolor"),
            builder.get_object("button_ledcolor_reset")
        );

        window.set_default_size(560, 480);
        window.add(builder.get_object("page_general"));
    }

    _bindCombo(settings, key, row, toIndex, fromIndex) {
        row.set_selected(toIndex(settings.get_int(key)));

        row.connect("notify::selected", () => {
            const value = fromIndex(row.get_selected());
            if (settings.get_int(key) !== value) settings.set_int(key, value);
        });

        const id = settings.connect(`changed::${key}`, () => {
            const index = toIndex(settings.get_int(key));
            if (row.get_selected() !== index) row.set_selected(index);
        });
        row.connect("destroy", () => settings.disconnect(id));
    }

    _bindColor(settings, key, button, resetButton) {
        const toRgba = (value) => {
            const rgba = new Gdk.RGBA();
            if (!rgba.parse(value)) rgba.parse(settings.get_default_value(key).deepUnpack());
            return rgba;
        };

        button.set_rgba(toRgba(settings.get_string(key)));

        button.connect("notify::rgba", () => {
            const value = button.get_rgba().to_string();
            if (!toRgba(settings.get_string(key)).equal(button.get_rgba())) settings.set_string(key, value);
        });

        const id = settings.connect(`changed::${key}`, () => {
            const rgba = toRgba(settings.get_string(key));
            if (!rgba.equal(button.get_rgba())) button.set_rgba(rgba);
            resetButton.set_sensitive(settings.get_user_value(key) !== null);
        });
        button.connect("destroy", () => settings.disconnect(id));

        resetButton.set_sensitive(settings.get_user_value(key) !== null);
        resetButton.connect("clicked", () => settings.reset(key));
    }
}
