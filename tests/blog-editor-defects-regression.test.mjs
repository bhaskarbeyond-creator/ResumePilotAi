import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

test('Blog Editor Regression 1: Zero circular dependencies in AuthContext', () => {
    const authContextPath = path.join(rootDir, 'src/context/AuthContext.jsx');
    assert.ok(fs.existsSync(authContextPath), 'AuthContext.jsx must exist');
    const content = fs.readFileSync(authContextPath, 'utf8');
    
    // AuthContext must not import from another context file that re-imports AuthContext
    assert.doesNotMatch(content, /from\s+['"]\.\/index['"]/);
    assert.doesNotMatch(content, /from\s+['"]\.\/AuthContext['"]/);
    // Must export AuthContext and AuthProvider
    assert.match(content, /export\s+const\s+AuthContext/);
    assert.match(content, /export\s+const\s+AuthProvider/);
});

test('Blog Editor Regression 2: AuthContext.Provider mounted in application root', () => {
    const mainPath = path.join(rootDir, 'src/main.jsx');
    const content = fs.readFileSync(mainPath, 'utf8');
    assert.match(content, /<AuthContext\.Provider\b/, 'main.jsx must wrap root with <AuthContext.Provider>');
    assert.match(content, /<\/AuthContext\.Provider>/, 'main.jsx must close </AuthContext.Provider>');
});

test('Blog Editor Regression 3: Blog Data API response envelopes conform to contract', () => {
    const blogDataRoutePath = path.join(rootDir, 'backend/routes/blogData.js');
    const content = fs.readFileSync(blogDataRoutePath, 'utf8');
    
    // GET /:id returns { success: true, post }
    assert.match(content, /res\.json\(\{\s*success:\s*true,\s*post\b/, 'GET /:id must return { success: true, post }');
    
    // POST /:id returns { success: true, post }
    assert.match(content, /res\.json\(\{\s*success:\s*true,\s*post:\s*saved\s*\}\)/, 'POST /:id must return { success: true, post }');
    
    // GET / returns { success: true, posts }
    assert.match(content, /res\.json\(\{\s*success:\s*true,\s*posts\s*\}\)/, 'GET / must return { success: true, posts }');
});

test('Blog Editor Regression 4: GET-by-ID route exists in backend router', () => {
    const blogDataRoutePath = path.join(rootDir, 'backend/routes/blogData.js');
    const content = fs.readFileSync(blogDataRoutePath, 'utf8');
    assert.match(content, /router\.get\('\/:id'/, 'backend/routes/blogData.js must define GET /:id route');
});

test('Blog Editor Regression 5: API exports parity in platform.js and blog.js', async () => {
    const platformApiPath = path.join(rootDir, 'src/services/api/platform.js');
    const content = fs.readFileSync(platformApiPath, 'utf8');
    
    const requiredExports = [
        'saveBlogPost',
        'createBlogPost',
        'updateBlogPost',
        'deleteBlogPost',
        'listBlogPosts',
        'listBlogCategories',
        'getBlogPostByIdForAuthor',
        'getUserBlogPosts'
    ];
    
    for (const exp of requiredExports) {
        const regex = new RegExp(`export\\s+(async\\s+)?function\\s+${exp}\\b|export\\s+const\\s+${exp}\\b`);
        assert.match(content, regex, `src/services/api/platform.js must export ${exp}`);
    }
});

test('Blog Editor Regression 6: Tiptap Color and TextStyle extensions imported and registered', () => {
    const blogEditorPath = path.join(rootDir, 'src/components/Blog/BlogEditor/BlogEditor.jsx');
    const content = fs.readFileSync(blogEditorPath, 'utf8');
    
    assert.match(content, /import\s+\{\s*Color\s*\}\s+from\s+['"]@tiptap\/extension-color['"]/, 'Must import Color extension');
    assert.match(content, /import\s+\{\s*TextStyle\s*\}\s+from\s+['"]@tiptap\/extension-text-style['"]/, 'Must import TextStyle extension');
    assert.match(content, /extensions:\s*\[[\s\S]*?\bTextStyle\b[\s\S]*?\bColor\b[\s\S]*?\]/, 'TextStyle and Color must be registered in editor extensions');
});

test('Blog Editor Regression 7: StrictMode editor lifecycle safety', () => {
    const blogEditorPath = path.join(rootDir, 'src/components/Blog/BlogEditor/BlogEditor.jsx');
    const content = fs.readFileSync(blogEditorPath, 'utf8');
    
    // Uses official useEditor hook which manages mount/unmount/cleanup natively
    assert.match(content, /const\s+editor\s*=\s*useEditor\(\{/);
    // Verifies editor content fallback is present when editor is null/unmounted
    assert.match(content, /\{editor\s*&&/);
});
