import { files, strings } from "starhermit:engine";
import * as ui from "starhermit:ui";
import { createTextTranslator, type MessageIndex } from "./text-core.js";

const index = files.readJson("assets/localization/messages.json") as unknown as MessageIndex;
strings.load("assets/strings.json");
strings.defaultLocale = "en-US";
const translator = createTextTranslator(index, (id, vars) => strings.t(id, vars));
ui.setLanguage(strings.locale);
strings.onChange((locale) => { translator.clear(); ui.setLanguage(locale); });
export const localizedText = translator.text;
export const preserveUserText = translator.keep;
export const localizedOptions = translator.options;
export const wrapDisplayText = translator.wrap;
