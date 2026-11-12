const escape = (text) => Array.from(text).map((c) => ".*+?^${}()|[]\\".includes(c) ? "\\" + c : c).join("");
export function createTextTranslator(index, lookup) {
    const cache = new Map();
    // A display-only marker survives custom drawing helpers (including String(value)).
    // It is removed at the final text boundary and never applied to input/model values.
    const rawPrefix = "\u2063l10n-raw:";
    const folded = new Map();
    const directIndex = new Map(Object.entries(index.direct));
    for (const [source, id] of Object.entries(index.direct)) {
        const key = source.toLowerCase(), matches = folded.get(key) || [];
        matches.push({ source, id });
        folded.set(key, matches);
    }
    const patterns = index.patterns.map((pattern) => {
        const names = [];
        const parts = pattern.source.split(/(\{v\d+\})/g);
        const expression = parts.map((part) => /^\{v\d+\}$/.test(part) ? (names.push(part.slice(1, -1)), "([\\s\\S]*?)") : escape(part)).join("");
        const literal = pattern.source.replace(/\{v\d+\}/g, "");
        return { ...pattern, names, expression: new RegExp("^" + expression + "$"), weight: literal.length };
    }).filter((pattern) => pattern.weight >= 2).sort((a, b) => b.weight - a.weight);
    function keep(value) {
        return (typeof value === "string" ? rawPrefix + value : value);
    }
    function direct(text) {
        const id = directIndex.get(text);
        if (id)
            return lookup(id);
        const matches = folded.get(text.toLowerCase());
        if (!matches)
            return null;
        const candidates = matches.map((match) => ({ ...match, translated: lookup(match.id) }));
        // Case variants can have different meanings (Clear/clear). Exact keys above
        // keep their own translation; an unlisted spelling must not pick arbitrarily.
        if (candidates.some((match) => match.translated.toLowerCase() !== candidates[0].translated.toLowerCase()))
            return null;
        const match = candidates.find((candidate) => candidate.source !== candidate.source.toUpperCase()) || candidates[0];
        const translated = match.translated;
        // English/fallback and shared words keep the caller's existing presentation.
        if (translated.toLowerCase() === match.source.toLowerCase())
            return text;
        if (text === text.toUpperCase() && text !== text.toLowerCase())
            return translated.toUpperCase();
        if (text[0] === text[0]?.toUpperCase() && match.source[0] === match.source[0]?.toLowerCase())
            return translated.charAt(0).toUpperCase() + translated.slice(1);
        // Preserve the stored target-language casing for lowercase and mixed-case
        // input: English casing does not determine another language's noun grammar.
        return translated;
    }
    function text(value) {
        if (typeof value !== "string")
            return value;
        if (value.startsWith(rawPrefix))
            return value.slice(rawPrefix.length);
        const cached = cache.get(value);
        if (cached !== undefined)
            return cached;
        let translated = direct(value);
        if (translated === null) {
            for (const pattern of patterns) {
                const match = pattern.expression.exec(value);
                if (!match)
                    continue;
                const vars = {};
                pattern.names.forEach((name, i) => {
                    const raw = match[i + 1];
                    vars[name] = pattern.protectedVariables.includes(name) ? raw : raw.length < value.length ? text(raw) : direct(raw) ?? raw;
                });
                translated = lookup(pattern.id, vars);
                break;
            }
        }
        const result = translated ?? value;
        if (cache.size >= 3000)
            cache.delete(cache.keys().next().value);
        cache.set(value, result);
        return result;
    }
    function options(values) {
        return values.map((value) => typeof value === "string" ? text(value) : value && typeof value === "object"
            ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, (key === "text" || key === "label") ? text(item) : item])) : value);
    }
    function wrap(value, width, measure) {
        const translated = text(value), output = [];
        if (!translated)
            return output;
        const clusters = (word) => {
            const result = [];
            for (const c of Array.from(word)) {
                const n = c.codePointAt(0);
                const mark = /\p{M}/u.test(c) || n === 0x200d;
                const last = result[result.length - 1];
                if (last && (mark || last.endsWith("\u200d") || last.endsWith("\u0bcd") || last.endsWith("\u17d2")))
                    result[result.length - 1] += c;
                else
                    result.push(c);
            }
            return result;
        };
        for (const paragraph of translated.split("\n")) {
            let line = "";
            for (const word of paragraph.split(" ")) {
                const next = line ? line + " " + word : word;
                if (line && measure(next) > width) {
                    output.push(line);
                    line = "";
                }
                if (measure(word) > width) {
                    for (const cluster of clusters(word)) {
                        if (line && measure(line + cluster) > width) {
                            output.push(line);
                            line = "";
                        }
                        line += cluster;
                    }
                }
                else
                    line = line ? line + " " + word : word;
            }
            output.push(line);
        }
        // Mark completed layout fragments so another display helper only unwraps them.
        return output.map(keep);
    }
    return { text, keep, options, wrap, clear: () => cache.clear() };
}
