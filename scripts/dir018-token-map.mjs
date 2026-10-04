/**
 * DIR-018 / AC-1 — legacy palette -> Cuba semantic token mapping.
 *
 * WHY A TABLE AND NOT A REGEX
 * Legacy Tailwind classes name a HUE and a SHADE (`bg-slate-50`). Cuba tokens name a
 * ROLE (`bg-cuba-canvas`). Collapsing a 2-D hue/shade space onto a 1-D role space is a
 * judgement call per token, not a pattern. A generic regex would silently produce
 * unreadable combinations -- mapping `text-amber-300` onto `text-cuba-warning` resolves
 * to near-black in LIGHT mode and fails WCAG AA against the permanently-dark billing
 * hero it actually sits on.
 *
 * THE NIGHT FAMILY (the important part)
 * The billing hero banner and checkout shell are deep-violet gradients that stay dark
 * in BOTH themes. Theme-adaptive role tokens intentionally INVERT between themes, so
 * they are wrong for light-on-dark hero text. Legacy tokens that are light shades used
 * as ink on those dark surfaces map to `--cuba-night-*` instead. Those values are pinned
 * >= 4.5:1 against all three gradient stops (.bridge/evidence/dir018-night-contrast.mjs).
 *
 * ALPHA
 * `/NN` suffixes are preserved and re-attached (`bg-indigo-600/20` ->
 * `bg-cuba-primary-fill/20`); Tailwind v4 resolves it via color-mix(), proven by
 * .bridge/tmp/tw-probe/verify-tokens.mjs.
 *
 * ROLE ASSIGNMENT
 *   slate/gray/white/black -> ink / line / surface roles
 *   indigo/violet/purple   -> primary      emerald/green/teal -> success
 *   amber/orange/yellow    -> warning      red/rose/pink       -> danger
 *   blue/sky/cyan          -> info
 */

/** Role tokens for *themed* (light-or-dark) surfaces. */
const R = {
    bg: {
        white: 'bg-cuba-card',
        slate: { 50: 'bg-cuba-canvas', 100: 'bg-cuba-elevated', 200: 'bg-cuba-line', 300: 'bg-cuba-line-strong', 400: 'bg-cuba-line-strong', 800: 'bg-cuba-ink', 900: 'bg-cuba-ink', 950: 'bg-cuba-ink' },
        gray: { 50: 'bg-cuba-canvas', 100: 'bg-cuba-elevated', 200: 'bg-cuba-line', 300: 'bg-cuba-line-strong' },
        black: 'bg-cuba-ink',
    },
    text: {
        // `text-white` sits on brand/dark fills -> on-primary, NOT ink.
        white: 'text-cuba-on-primary',
        slate: { 950: 'text-cuba-ink', 900: 'text-cuba-ink', 800: 'text-cuba-ink', 700: 'text-cuba-ink', 600: 'text-cuba-ink-muted', 500: 'text-cuba-ink-muted', 400: 'text-cuba-ink-subtle', 300: 'text-cuba-ink-subtle', 200: 'text-cuba-ink-subtle', 100: 'text-cuba-ink-subtle' },
        gray: { 700: 'text-cuba-ink', 600: 'text-cuba-ink-muted', 500: 'text-cuba-ink-muted', 400: 'text-cuba-ink-subtle' },
        black: 'text-cuba-ink',
    },
    border: {
        white: 'border-cuba-line',
        slate: { 100: 'border-cuba-line', 200: 'border-cuba-line', 300: 'border-cuba-line-strong', 400: 'border-cuba-line-strong', 500: 'border-cuba-line-strong', 600: 'border-cuba-line-strong', 700: 'border-cuba-line-strong' },
        gray: { 200: 'border-cuba-line', 300: 'border-cuba-line-strong' },
        black: 'border-cuba-line-strong',
    },
    divide: { slate: { 100: 'divide-cuba-line', 200: 'divide-cuba-line', 300: 'divide-cuba-line' } },
    ring: { white: 'ring-cuba-line' },
};

/**
 * Gradient stops over the NEUTRAL (slate/white) ramp, e.g. the light modal header
 * `from-indigo-50/80 via-purple-50/40 to-slate-50/70`. Hues are handled by HUE_ROLE
 * below; only the neutral hues need explicit entries here.
 */
const NEUTRAL_STOPS = {
    from: { slate: { 50: 'from-cuba-canvas', 100: 'from-cuba-elevated', 200: 'from-cuba-line', 300: 'from-cuba-line-strong' } },
    via: { slate: { 50: 'via-cuba-canvas', 100: 'via-cuba-elevated', 200: 'via-cuba-line' }, white: { 0: 'via-cuba-card' } },
    to: { slate: { 50: 'to-cuba-canvas', 100: 'to-cuba-elevated', 200: 'to-cuba-line', 300: 'to-cuba-line-strong' } },
};

/** Hue -> role stem; everything else derives from the shade. */
const HUE_ROLE = {
    indigo: 'primary', violet: 'primary', purple: 'primary',
    emerald: 'success', green: 'success', teal: 'success',
    amber: 'warning', orange: 'warning', yellow: 'warning',
    red: 'danger', rose: 'danger', pink: 'danger',
    blue: 'info', sky: 'info', cyan: 'info',
};

/**
 * Shade -> emphasis kind, per CSS property.
 *   soft = -soft tint (low-emphasis bg/border)   solid = the role colour
 *   strong = the -fill / -ink-strong emphasis variant
 */
const SHADE = {
    bg: { 50: 'soft', 100: 'soft', 200: 'soft', 300: 'solid', 400: 'solid', 500: 'solid', 600: 'solid', 700: 'strong', 800: 'strong', 900: 'strong', 950: 'strong' },
    text: { 100: 'soft', 200: 'soft', 300: 'solid', 400: 'solid', 500: 'solid', 600: 'solid', 700: 'strong', 800: 'strong', 900: 'strong', 950: 'strong' },
    border: { 100: 'soft', 200: 'soft', 300: 'soft', 400: 'solid', 500: 'solid', 600: 'solid', 700: 'strong' },
    ring: { 300: 'soft', 400: 'solid', 500: 'solid', 600: 'solid' },
    // Gradient stops share the bg scale: a 50/100 stop is the -soft tint, a
    // 500/600 stop is the solid role colour, a 900/950 stop collapses to ink.
    from: { 50: 'soft', 100: 'soft', 200: 'soft', 400: 'solid', 500: 'solid', 600: 'solid', 700: 'strong', 800: 'strong', 900: 'strong', 950: 'strong' },
    via: { 50: 'soft', 100: 'soft', 200: 'soft', 400: 'solid', 500: 'solid', 600: 'solid', 700: 'strong', 800: 'strong', 900: 'strong', 950: 'strong' },
    to: { 50: 'soft', 100: 'soft', 200: 'soft', 400: 'solid', 500: 'solid', 600: 'solid', 700: 'strong', 800: 'strong', 900: 'strong', 950: 'strong' },
    // A coloured shadow is decorative; the role fill is what carries the hue.
    shadow: { 300: 'solid', 400: 'solid', 500: 'solid', 600: 'solid', 700: 'strong', 800: 'strong', 900: 'strong' },
};

/**
 * Tokens that MUST resolve to the NIGHT family because they render light-on-dark
 * inside the permanently-dark billing hero / checkout shell.
 *
 * KEYED BY THE FULL BARE UTILITY, alpha included (e.g. `bg-white/10`), because the
 * same hue means different things at different opacities: `bg-white` is an opaque
 * light card, while `bg-white/10` is a faint white scrim on a dark surface.
 */
const NIGHT = {
    // -- ink on dark ---------------------------------------------------
    'text-white': 'text-cuba-night-ink',
    'text-white/60': 'text-cuba-night-ink-muted',
    'hover:text-white': 'hover:text-cuba-night-ink',
    // -- translucent white scrims / hairlines on dark -------------------
    'bg-white/5': 'bg-cuba-night-line',
    'bg-white/10': 'bg-cuba-night-line',
    'bg-white/20': 'bg-cuba-night-line',
    // Near-opaque white chip on the dark modal header: reads as a solid light pill,
    // so it maps to the card surface rather than a translucent night scrim.
    'bg-white/90': 'bg-cuba-card',
    'hover:bg-white/20': 'hover:bg-cuba-night-line',
    'border-white': 'border-cuba-night-line',
    'border-white/10': 'border-cuba-night-line',
    'border-white/20': 'border-cuba-night-line',
    'border-white/30': 'border-cuba-night-line',
    // The dark-header close button's focus ring. Keyed WITHOUT the `focus:` variant
    // because the lookup strips leading variants before consulting this table.
    'ring-white/50': 'ring-cuba-night-line',
    // -- coloured ink used as light-on-dark ------------------------------
    'text-indigo-100': 'text-cuba-night-ink',
    'text-indigo-200': 'text-cuba-night-ink',
    'text-indigo-300': 'text-cuba-night-primary',
    'text-violet-400': 'text-cuba-night-primary',
    'text-emerald-100': 'text-cuba-night-ink',
    'text-emerald-300': 'text-cuba-night-success',
    'text-emerald-400': 'text-cuba-night-success',
    'text-amber-100': 'text-cuba-night-ink',
    'text-amber-300': 'text-cuba-night-warning',
    'text-amber-400': 'text-cuba-night-warning',
    'text-rose-100': 'text-cuba-night-danger',
};

/**
 * Gradient stops of the PERMANENTLY-DARK hero banners. Theme-adaptive role tokens
 * invert between themes, so a dark-violet hero must keep a pinned dark ramp or the
 * banner turns pale in light mode. These map onto the existing
 * --cuba-night-surface-from/mid/to ramp (the same values the inline hex gradients
 * already used, e.g. #0f0c29 -> #302b63 -> #24243e).
 *
 * KEYED BY `${hue}-${shade}`, and ONLY for deep shades (>= 800). Keying by hue alone
 * would be wrong: `from-indigo-900` is a dark hero stop, but `from-indigo-600` is the
 * light brand gradient on the checkout buttons, and both share the `indigo` hue.
 */
const NIGHT_SURFACE = {
    from: {
        'slate-900': 'from-cuba-night-surface-from',
        'indigo-900': 'from-cuba-night-surface-from',
    },
    via: {
        'slate-900': 'via-cuba-night-surface-mid',
        'indigo-800': 'via-cuba-night-surface-mid',
        'indigo-950': 'via-cuba-night-surface-mid',
        'purple-900': 'via-cuba-night-surface-mid',
    },
    to: {
        'slate-900': 'to-cuba-night-surface-to',
        'purple-950': 'to-cuba-night-surface-to',
    },
};

/**
 * Irregular utilities the generic parser cannot express, keyed by full bare utility.
 * e.g. the checkout spinner `border-2 border-white/30 border-t-white` needs the
 * top edge in opaque ink to read as a rotating arc.
 */
const DIRECT = {
    'border-t-white': 'border-t-cuba-night-ink',
    'via-white': 'via-cuba-card',
    'text-white': 'text-cuba-on-primary',
    'bg-white': 'bg-cuba-card',
    'border-white': 'border-cuba-line',
};

/**
 * Resolve ONE legacy utility to its Cuba replacement, or null to leave it alone.
 * `token` is a full utility INCLUDING variants, e.g. `hover:bg-slate-100`.
 */
export function mapToken(token) {
    if (!token) return null;
    if (token.includes('cuba-')) return null;

    // Preserve leading variants: hover:, focus:, dark:, disabled:, focus-within: ...
    const variantMatch = token.match(/^((?:[a-z0-9-]+:)*)/);
    const variants = variantMatch ? variantMatch[1] : '';
    const bare = token.slice(variants.length);
    if (!bare) return null;

    const utility = bare.split(':').pop();

    // Irregular forms first (e.g. `border-t-white`).
    if (DIRECT[bare]) return variants + DIRECT[bare];

    // Night overrides next: these are the contrast-critical cases. Keyed on the FULL
    // bare utility so alpha variants (`bg-white` vs `bg-white/10`) can differ.
    if (NIGHT[bare]) return variants + NIGHT[bare];

    // Colour + OPTIONAL shade. The shade group is optional because `white` and
    // `black` carry no numeric step -- requiring `-<digits>` made every white/black
    // utility unparseable, which silently left 40+ classes on the legacy palette.
    const m = utility.match(/^([a-z]+)-(?:([a-z]+)-)?(\d{2,3})?(\/\d{1,3})?$/);
    if (!m) return null;
    const [, prop, colourRaw, shadeRaw, alpha] = m;
    const colour = colourRaw || 'none';

    // The permanently-dark hero gradients get the pinned night ramp before any
    // theme-adaptive role logic, so the banner stays dark in BOTH themes.
    if (shadeRaw !== undefined) {
        const surfaceStop = NIGHT_SURFACE[prop]?.[`${colour}-${shadeRaw}`];
        if (surfaceStop) return variants + surfaceStop + (alpha || '');
    }

    // Explicit neutral table (handles `white`, `black` and the slate scale).
    // `R[prop].white`/`R[prop].black` are direct scalars; the hue-named keys are
    // shade maps keyed by colour name.
    const neutralProp = R[prop];
    if (neutralProp && typeof neutralProp !== 'string') {
        if (shadeRaw === undefined && colour in neutralProp && typeof neutralProp[colour] === 'string') {
            return variants + neutralProp[colour] + (alpha || '');
        }
        if (shadeRaw !== undefined && neutralProp[colour] && typeof neutralProp[colour] === 'object') {
            const hit = neutralProp[colour][Number(shadeRaw)];
            if (hit) return variants + hit + (alpha || '');
        }
    }

    // Role hues.
    const role = HUE_ROLE[colour];
    const shade = Number(shadeRaw);
    if (!role || !shade) {
        // Neutral gradient stops (slate/white ramps) resolve via their own table.
        const neutralStop = NEUTRAL_STOPS[prop]?.[colour]?.[Number(shadeRaw) || 0];
        if (neutralStop) return variants + neutralStop + (alpha || '');
        return null;
    }

    const kind = SHADE[prop]?.[shade];
    if (!kind) return null;

    let replacement = null;
    if (prop === 'bg') {
        if (kind === 'soft') replacement = `bg-cuba-${role}-soft`;
        else if (kind === 'solid') replacement = role === 'primary' ? 'bg-cuba-primary-fill' : `bg-cuba-${role}`;
        else replacement = role === 'primary' ? 'bg-cuba-primary-strong' : `bg-cuba-${role}`;
    } else if (prop === 'text') {
        if (kind === 'soft') replacement = role === 'primary' ? 'text-cuba-primary' : `text-cuba-${role}`;
        else replacement = role === 'primary' ? 'text-cuba-primary-ink-strong' : `text-cuba-${role}`;
    } else if (prop === 'border') {
        if (kind === 'soft') replacement = `border-cuba-${role}-soft`;
        else replacement = `border-cuba-${role}`;
    } else if (prop === 'ring') {
        replacement = `ring-cuba-${role}`;
    } else if (prop === 'from' || prop === 'via' || prop === 'to') {
        // Gradient stops paint background, so they follow the same role ladder as
        // `bg` but must emit the `from-/via-/to-` property prefix.
        if (kind === 'soft') replacement = `${prop}-cuba-${role}-soft`;
        else if (kind === 'solid') replacement = role === 'primary' ? `${prop}-cuba-primary-fill` : `${prop}-cuba-${role}`;
        else replacement = role === 'primary' ? `${prop}-cuba-primary-strong` : `${prop}-cuba-${role}`;
    } else if (prop === 'shadow') {
        // A coloured shadow is decorative; the role colour carries the hue and the
        // alpha suffix is preserved so the glow keeps its original intensity.
        replacement = `shadow-cuba-${role}`;
    } else {
        return null;
    }

    return variants + replacement + (alpha || '');
}

export default mapToken;