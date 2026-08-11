import fs from 'fs';
import path from 'path';

const source = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda\\template_cv1.png";
const target = "d:\\xampp\\htdocs\\ai-resume-builder\\src\\assets\\resumesNew\\Cv1.JPG";

try {
    fs.copyFileSync(source, target);
    console.log("Successfully updated Cv1.JPG thumbnail with 10/10 masterpiece preview!");
} catch (err) {
    console.error("Error copying thumbnail:", err.message);
}
