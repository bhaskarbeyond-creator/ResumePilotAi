import fs from 'fs';

const source = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda\\cv2_masterpiece_export.png";
const target = "d:\\xampp\\htdocs\\ai-resume-builder\\src\\assets\\resumesNew\\Cv2.JPG";

try {
    fs.copyFileSync(source, target);
    console.log("Successfully updated Cv2.JPG thumbnail in assets!");
} catch (e) {
    console.error("Error copying Cv2 thumbnail:", e.message);
}
