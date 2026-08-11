import fs from 'fs';
import { parseResumeTextToStructuredData } from '../src/services/aiService.js';

(async () => {
  console.log('=== TESTING DIRECT AI PARSING FOR BHASKAR RESUME ===');
  const rawText = fs.readFileSync('C:\\Users\\mbhas\\Downloads\\Bhaskar_Resume_Manager (1).txt', 'utf-8');
  console.log('Raw Text extracted (length):', rawText.length);
  console.log('Snippet:\n', rawText.substring(0, 300));

  try {
    const result = await parseResumeTextToStructuredData(rawText);
    console.log('✔ AI Parse Result:\n', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('❌ AI Parse Error:', err);
  }
})();
