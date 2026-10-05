/**
 * DIR-047 census probe. Counts the template FAMILIES that actually render a
 * document, which is what the directive's "51 CV + 4 cover" figures describe.
 *
 * A family directory (src/cv-templates/cv<N>/) renders ONE canonical component,
 * `Cv<N>.jsx`. Sixteen of those families ALSO ship a `Cv<N>Export.jsx` print/PDF
 * companion -- several of which are 0-byte placeholders -- so naively counting
 * every `.jsx` under the family sums 51 + 16 = 67 and mis-reports the inventory.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'cv-templates');

function countFamily(prefix, component) {
    const canonical = new RegExp(`^${component}\\d+\\.jsx$`);
    const families = fs.readdirSync(ROOT, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && new RegExp(`^${prefix}\\d+$`).test(entry.name))
        .map((entry) => entry.name);

    const components = families.flatMap((family) =>
        fs.readdirSync(path.join(ROOT, family))
            .filter((file) => canonical.test(file))
            .map((file) => `${family}/${file}`));

    return { familyCount: families.length, components };
}

const cv = countFamily('cv', 'Cv');
const cover = countFamily('cover', 'Cover');

console.log(JSON.stringify({
    cvFamilies: cv.familyCount,
    cvComponents: cv.components.length,
    coverFamilies: cover.familyCount,
    coverComponents: cover.components.length,
    unmatchedCvFamilies: cv.familyCount - cv.components.length,
    unmatchedCoverFamilies: cover.familyCount - cover.components.length,
    cvSample: cv.components.slice(0, 3),
    coverSample: cover.components,
}, null, 2));