const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const EmailNotifier = require('../services/emailNotifier');
const router = express.Router();

async function getGeminiApiKey(req) {
    if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
    const db = req.app.get('db');
    if (!db) return '';
    try {
        const secrets = await db.collection('settings').doc('ai_providers').get();
        if (secrets.exists && secrets.data()?.gemini?.apiKey) return secrets.data().gemini.apiKey;
        const legacy = await db.collection('data').doc('system_settings').get();
        return legacy.data()?.ai?.geminiApiKey || '';
    } catch (error) {
        console.warn('[AI config]', error.message);
        return '';
    }
}

// Provider credentials are server-owned. Bound prompt inputs before any paid provider call.
router.use((req, res, next) => {
    if (req.method === 'GET') return next();
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'apiKey') || req.get('x-gemini-api-key')) {
        return res.status(400).json({ error: { code: 'CLIENT_AI_KEY_REJECTED', message: 'Client-supplied AI credentials are not accepted', requestId: res.locals.requestId } });
    }
    const serialized = JSON.stringify(req.body || {});
    if (serialized.length > 50_000) {
        return res.status(413).json({ error: { code: 'AI_INPUT_TOO_LARGE', message: 'AI input exceeds the allowed size', requestId: res.locals.requestId } });
    }
    return next();
});

// Resume generation endpoint
router.post('/generate-resume', async (req, res) => {
    try {
        const { occupation, experienceLevel, skills = [], education = [], language = 'en', userName } = req.body;

        if (req.user?.email) {
            EmailNotifier.notifyAIResumeReady(req.app.get('db'), {
                userEmail: req.user.email,
                userName: userName || 'Candidate',
                atsScore: '94'
            }).catch(e => console.warn('[AI Notifier] Resume email notice:', e.message));
        }

        // Language mapping for proper language names in prompt
        const languageNames = {
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            nl: 'Dutch',
            pl: 'Polish',
            se: 'Swedish',
            no: 'Norwegian',
            dk: 'Danish',
            is: 'Icelandic',
            gk: 'Greek',
            ro: 'Romanian',
        };

        const targetLanguage = languageNames[language] || 'English';

        // Get years of experience range based on experience level
        let yearsOfExperience;
        let positionLevel;
        let currentYear = new Date().getFullYear();
        let cleanOccupation = occupation.trim();
        let positionTitle;

        // Setup basic variables based on experience level first
        switch (experienceLevel) {
            case 'entry-level':
                yearsOfExperience = { min: 0, max: 2 };
                positionLevel = 'Junior';
                break;
            case 'mid-level':
                yearsOfExperience = { min: 3, max: 5 };
                positionLevel = '';
                break;
            case 'senior-level':
                yearsOfExperience = { min: 6, max: 12 };
                positionLevel = 'Senior';
                break;
            default:
                yearsOfExperience = { min: 3, max: 5 };
                positionLevel = '';
        }

        // Format position title with level
        positionTitle = positionLevel ? `${positionLevel} ${cleanOccupation}` : cleanOccupation;

        // Check for API key from request body, headers, or env
        const apiKey = await getGeminiApiKey(req);

        if (!apiKey) {
            console.log('No API key found, using fallback generator');
            const fallbackData = generateDefaultResumeData(cleanOccupation, experienceLevel, yearsOfExperience, positionTitle, currentYear, skills, education, targetLanguage);
            return res.json(fallbackData);
        }

        // Initialize the Gemini API
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // Prepare the prompt for Gemini
        const prompt = `
        Generate a professional resume content for a ${positionTitle} with ${yearsOfExperience.max} years of experience.
        
        IMPORTANT: Generate ALL content in ${targetLanguage}. This includes all text, descriptions, and field values.
        
        Specific info:
        - Occupation: ${cleanOccupation}
        - Experience level: ${experienceLevel} (${yearsOfExperience.min}-${yearsOfExperience.max} years)
        - Skills: ${skills.length > 0 ? skills.join(', ') : 'Generate appropriate skills for this role'}
        - Education: ${education.length > 0 ? education.join(', ') : 'Generate appropriate education background'}
        - Target Language: ${targetLanguage}
        
        Generate a realistic professional summary, work experiences with achievements, education history, and relevant skills. 
        Please provide a COMPREHENSIVE profile with AT LEAST 3 employment entries and AT LEAST 3 education entries.
        
        Return the results in a structured JSON format with the following fields:
        1. firstname: A common first name in ${targetLanguage}
        2. lastname: A common last name in ${targetLanguage}
        3. email: A professional email based on the name
        4. phone: A realistic phone number in (555) 123-4567 format
        5. occupation: The exact job title provided
        6. country: A country where ${targetLanguage} is spoken
        7. city: A city in that country
        8. address: A generic address in ${targetLanguage}
        9. summary: A well-written professional summary paragraph in ${targetLanguage}
        10. employments: An array of AT LEAST 3 employment objects each containing:
            - id: A numeric ID (1, 2, etc.)
            - jobTitle: Job title in ${targetLanguage}, showing progression if multiple jobs
            - employer: Company name
            - begin: Start year (based on experience range)
            - end: End year or "Present" for current job
            - description: 3-4 bullet points of achievements in ${targetLanguage}
            - date: A timestamp
        11. educations: An array of AT LEAST 3 education objects each containing:
            - id: A numeric ID
            - school: School name (use provided education if available)
            - degree: Relevant degree name in ${targetLanguage}
            - started: Start year
            - finished: End year
            - description: Brief description in ${targetLanguage}
            - date: A timestamp
        12. languages: An array of language objects, EXACTLY in this format:
            [
              {
                "id": 1,
                "name": "${targetLanguage}",
                "level": "Native",
                "date": 1718348693123
              },
              {
                "id": 2,
                "name": "English",
                "level": "Intermediate",
                "date": 1718348693000
              }
            ]
        13. skills: An array of AT LEAST 8 skill objects, EXACTLY in this format:
            [
              {
                "id": 1,
                "name": "JavaScript",
                "rating": 4,
                "date": 1718348693123
              },
              {
                "id": 2,
                "name": "React",
                "rating": 5,
                "date": 1718348693000
              }
            ]
        
        Important: Ensure that skills and languages are properly formatted with "name" fields for each item. Do not change the field names in the output.
        ALL TEXT CONTENT must be in ${targetLanguage}.
        Only return the JSON without any explanation or additional text.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        // Parse the JSON response
        // The text might have markdown code blocks, so we need to extract the JSON
        let jsonText = text;
        if (text.includes('```json')) {
            jsonText = text.split('```json')[1].split('```')[0].trim();
        } else if (text.includes('```')) {
            jsonText = text.split('```')[1].split('```')[0].trim();
        }

        try {
            const resumeData = JSON.parse(jsonText);
            console.log('Successfully parsed JSON response from AI');

            // Validate and fix skills format if needed
            if (resumeData.skills && Array.isArray(resumeData.skills)) {
                resumeData.skills = resumeData.skills.map((skill, index) => {
                    // Ensure skills have the required format
                    return {
                        id: skill.id || index + 1,
                        name: skill.name || skill.skill || skill.title || `Skill ${index + 1}`,
                        rating: skill.rating || skill.level || 4,
                        date: Date.now() - index * 1000,
                    };
                });
            }

            // Validate and fix languages format if needed
            if (resumeData.languages && Array.isArray(resumeData.languages)) {
                resumeData.languages = resumeData.languages.map((language, index) => {
                    // Ensure languages have the required format
                    return {
                        id: language.id || index + 1,
                        name: language.name || language.language || `Language ${index + 1}`,
                        level: language.level || 'Intermediate',
                        date: Date.now() - index * 1000,
                    };
                });
            }

            res.json(resumeData);
        } catch (error) {
            console.error('Failed to parse JSON from AI response:', error);
            const fallbackData = generateDefaultResumeData(cleanOccupation, experienceLevel, yearsOfExperience, positionTitle, currentYear, skills, education, targetLanguage);
            res.json(fallbackData);
        }
    } catch (error) {
        console.error('Error generating AI content:', error);
        // Use fallback method if AI generation fails
        const { occupation, experienceLevel, skills = [], education = [], language = 'en' } = req.body;
        const currentYear = new Date().getFullYear();

        let yearsOfExperience;
        let positionLevel;

        switch (experienceLevel) {
            case 'entry-level':
                yearsOfExperience = { min: 0, max: 2 };
                positionLevel = 'Junior';
                break;
            case 'mid-level':
                yearsOfExperience = { min: 3, max: 5 };
                positionLevel = '';
                break;
            case 'senior-level':
                yearsOfExperience = { min: 6, max: 12 };
                positionLevel = 'Senior';
                break;
            default:
                yearsOfExperience = { min: 3, max: 5 };
                positionLevel = '';
        }

        const cleanOccupation = occupation.trim();
        const positionTitle = positionLevel ? `${positionLevel} ${cleanOccupation}` : cleanOccupation;

        const fallbackData = generateDefaultResumeData(cleanOccupation, experienceLevel, yearsOfExperience, positionTitle, currentYear, skills, education, language);
        res.json(fallbackData);
    }
});

// Summary generation endpoint
router.post('/generate-summary', async (req, res) => {
    try {
        const { name, jobTitle, experience, workHistory, education, projects, skills, certifications, achievement, summaryType, language = 'en' } = req.body;

        console.log('Received summary request with language:', language);
        console.log('Full summary request body:', req.body);

        // Language mapping for proper language names in prompt
        const languageNames = {
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            nl: 'Dutch',
            pl: 'Polish',
            se: 'Swedish',
            no: 'Norwegian',
            dk: 'Danish',
            is: 'Icelandic',
            gk: 'Greek',
            ro: 'Romanian',
        };

        const targetLanguage = languageNames[language] || 'English';
        console.log('Summary target language mapped to:', targetLanguage);

        // Check for API key from request body, headers, or env
        const apiKey = await getGeminiApiKey(req);

        if (!apiKey) {
            console.log('No API key found, using fallback summary generator');
            const fallbackSummary = generateFallbackSummary(name, jobTitle, experience, skills, achievement, summaryType, targetLanguage);
            return res.json({ summary: fallbackSummary });
        }

        // Initialize the Gemini API
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // Prepare prompt based on summaryType
        let styleGuidance = '';
        switch (summaryType) {
            case 'professional':
                styleGuidance = 'Create a formal, concise professional summary focusing on expertise and achievements.';
                break;
            case 'creative':
                styleGuidance = 'Create a creative, engaging summary that highlights unique qualities while remaining professional.';
                break;
            case 'achievement':
                styleGuidance = 'Create an achievement-focused summary that emphasizes measurable results and impact.';
                break;
            default:
                styleGuidance = 'Create a formal, concise professional executive summary synthesizing complete candidate history.';
        }

        // Clean experience string for prompt
        let expSpan = experience || '3+ years';
        if (typeof expSpan === 'string' && (expSpan.length > 25 || expSpan.includes(' at ') || expSpan.includes(';'))) {
            expSpan = 'several years';
        }

        // Prepare the prompt for Gemini
        const prompt = `
        You are a Fortune 500 Senior Recruiter and Executive Resume Editor. ${styleGuidance}

        CRITICAL REQUIREMENT: You MUST write everything in ${targetLanguage}. Do NOT use English if the target language is not English.
        ${targetLanguage === 'Spanish' ? 'ESCRIBIR EN ESPAÑOL SOLAMENTE. NO USAR INGLÉS.' : ''}
        ${targetLanguage === 'French' ? "ÉCRIRE EN FRANÇAIS SEULEMENT. NE PAS UTILISER L'ANGLAIS." : ''}
        
        LANGUAGE: ${targetLanguage}
        TARGET LANGUAGE: ${targetLanguage}
        WRITE IN: ${targetLanguage}
        RESPONSE LANGUAGE: ${targetLanguage}

        Synthesize this candidate's complete professional profile into a 10/10 human-written, ATS-optimized Executive Resume Summary (2-3 sentences, 50-70 words maximum):
        - Candidate Name: ${name || 'Professional'}
        - Target Role/Occupation: "${jobTitle || 'Professional'}"
        - Calculated Experience Span: ${expSpan}
        - Work History & Roles: ${workHistory || experience || 'Solid industry track record'}
        - Academic Education: ${education || 'Higher education background'}
        - Core Technical Skills: ${skills || 'Key industry skills'}
        - Professional Certifications & Accreditations: ${certifications || 'None specified'}
        - Major Projects & Accomplishments: ${projects || achievement || 'Delivered key organizational outcomes'}
        
        STRICT 10/10 NATURAL HUMAN VOICE RULES:
        1. PUNCHY 2-3 SENTENCE RESUME STRUCTURE:
           - Sentence 1: Start directly with role identity and primary tech domain (e.g., "${jobTitle || 'Full-Stack Engineer'} with ${expSpan} of experience in Full-Stack Engineering, Cloud Architecture, and DevOps.").
           - Sentence 2: Summarize actual accomplishments from work history (e.g., "Proven track record modernizing API architectures, optimizing backend database performance, and building automated CI/CD pipelines.").
           - Sentence 3: Highlight technical stack and industry focus (e.g., "Proficient in Node.js, React, and AWS cloud solutions focused on high-availability system scalability.").
        2. BAN COVER LETTER FLUFF: NEVER write cover letter phrases like "I would bring immediate strategic value to your organization", "make a tangible impact from day one", or "leveraging my expertise to drive business growth". This is a RESUME SUMMARY!
        3. BAN ROBOTIC AI CLICHÉS: Eliminate "seasoned professional", "proven track record of", "resulting in significant performance gains", "spearheaded", "leveraged", "utilize", "fostered", "tapestry", "beacon", "testament".
        4. NO PLACEHOLDERS: Write 100% complete, ready-to-use sentences.
        
        ONLY return the summary text without any surrounding quotes, tags, or markdown wrapper.
        `;

        console.log('Sending summary prompt to AI with target language:', targetLanguage);
        console.log('Summary prompt preview:', prompt.substring(0, 200) + '...');

        // Call Gemini API
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const summary = response.text();

        console.log('AI summary response received for language', targetLanguage + ':', summary.substring(0, 150) + '...');
        console.log('Successfully generated AI summary for language:', targetLanguage);
        return res.json({ summary });
    } catch (error) {
        console.error('Error generating AI summary:', error);
        // Use fallback method if AI generation fails
        const { name, jobTitle, experience, skills, achievement, summaryType, language = 'en' } = req.body;
        const languageNames = {
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            nl: 'Dutch',
            pl: 'Polish',
            se: 'Swedish',
            no: 'Norwegian',
            dk: 'Danish',
            is: 'Icelandic',
            gk: 'Greek',
            ro: 'Romanian',
        };
        const targetLanguage = languageNames[language] || 'English';
        console.log('Using fallback summary for language:', targetLanguage);
        const fallbackSummary = generateFallbackSummary(name, jobTitle, experience, skills, achievement, summaryType, targetLanguage);
        return res.json({ summary: fallbackSummary });
    }
});

// Generate interview questions based on occupation and interview type
router.post('/generate-interview', async (req, res) => {
    try {
        const { occupation, interviewType, questionCount = 10, language = 'en' } = req.body;

        if (!occupation || !interviewType) {
            return res.status(400).json({ error: 'Occupation and interview type are required' });
        }

        // Validate question count
        const validQuestionCount = Math.min(Math.max(parseInt(questionCount) || 10, 5), 15);

        // Language mapping for proper language names in prompt
        const languageNames = {
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            nl: 'Dutch',
            pl: 'Polish',
            se: 'Swedish',
            no: 'Norwegian',
            dk: 'Danish',
            is: 'Icelandic',
            gk: 'Greek',
            ro: 'Romanian',
        };

        const targetLanguage = languageNames[language] || 'English';

        const apiKey = await getGeminiApiKey(req);
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // Customize prompt based on interview type
        let promptContext = '';
        if (interviewType === 'technical') {
            promptContext = `technical skills, frameworks, methodologies, problem-solving approaches, and systems design`;
        } else if (interviewType === 'behavioral') {
            promptContext = `leadership skills, communication abilities, conflict resolution, teamwork, adaptability, work ethic, and professional challenges`;
        }

        const prompt = `
        Generate exactly ${validQuestionCount} realistic interview questions for a ${occupation} position in ${targetLanguage}. The interview type is ${interviewType}, so focus on ${promptContext}.
        
        IMPORTANT: All text including questions, answer options, and explanations must be written in ${targetLanguage}.
        
        For each question, include:
        1. The question text
        2. Four answer options (labeled as options)
        3. The index of the correct answer (0-3)
        4. The category/topic of the question
        5. A difficulty level (Easy, Intermediate, Advanced)
        6. A brief explanation of why the correct answer is right
        7. Estimated time to answer in seconds (between 60-240 seconds)
        
        Ensure the difficulty distribution is balanced: ${Math.floor(validQuestionCount * 0.3)} Easy questions, ${Math.floor(validQuestionCount * 0.5)} Intermediate questions, and ${Math.ceil(
            validQuestionCount * 0.2
        )} Advanced questions.
        
        Format the response as a JSON object with this structure:
        {
            "title": "Interview for ${occupation} - ${interviewType} Assessment",
            "company": "Professional Evaluation Services",
            "department": "${interviewType === 'technical' ? 'Technical Department' : 'Human Resources'}",
            "duration": "${Math.round(validQuestionCount * 3)} minutes",
            "totalQuestions": ${validQuestionCount},
            "passingScore": 70,
            "categories": ["list", "of", "categories"],
            "questions": [
                {
                    "id": 1,
                    "question": "Question text?",
                    "options": ["Option A", "Option B", "Option C", "Option D"],
                    "correctAnswer": 0,
                    "category": "Category name",
                    "difficulty": "Easy/Intermediate/Advanced",
                    "weight": 1,
                    "explanation": "Explanation of the correct answer",
                    "estimatedTime": 120
                }
            ]
        }
        
        Ensure the questions are realistic and appropriately challenging for a professional interview. Make sure the correct answers are accurate and the explanations are helpful.
        Only return the JSON without any explanation or additional text.
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const responseText = response.text();

        try {
            // Extract the JSON from the response
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            const jsonStr = jsonMatch ? jsonMatch[0] : responseText;
            const jsonData = JSON.parse(jsonStr);

            // Ensure we have the correct number of questions
            if (jsonData.questions && jsonData.questions.length !== validQuestionCount) {
                jsonData.questions = jsonData.questions.slice(0, validQuestionCount);
                jsonData.totalQuestions = validQuestionCount;
            }

            res.json(jsonData);
        } catch (parseError) {
            console.error('Error parsing AI response:', parseError);
            // Fall back to generating default interview questions
            const fallbackData = generateDefaultInterview(occupation, interviewType, validQuestionCount, targetLanguage);
            res.json(fallbackData);
        }
    } catch (error) {
        console.error('Error generating interview questions:', error);
        // Use fallback if AI generation fails
        const { occupation, interviewType, questionCount = 10, language = 'en' } = req.body;
        const languageNames = {
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            nl: 'Dutch',
            pl: 'Polish',
            se: 'Swedish',
            no: 'Norwegian',
            dk: 'Danish',
            is: 'Icelandic',
            gk: 'Greek',
            ro: 'Romanian',
        };
        const targetLanguage = languageNames[language] || 'English';
        const fallbackData = generateDefaultInterview(occupation, interviewType, questionCount, targetLanguage);
        res.json(fallbackData);
    }
});

// Generate work experience descriptions endpoint
router.post('/generate-work-description', async (req, res) => {
    try {
        const { jobTitle, employer, startDate, endDate, current, language = 'en' } = req.body;

        console.log('Received work description request with language:', language);
        console.log('Full request body:', req.body);

        if (!jobTitle || !employer) {
            return res.status(400).json({ error: 'Job title and employer are required' });
        }

        // Language mapping for proper language names in prompt
        const languageNames = {
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            nl: 'Dutch',
            pl: 'Polish',
            se: 'Swedish',
            no: 'Norwegian',
            dk: 'Danish',
            is: 'Icelandic',
            gk: 'Greek',
            ro: 'Romanian',
        };

        const targetLanguage = languageNames[language] || 'English';
        console.log('Target language mapped to:', targetLanguage);

        // Check for API key from request body, headers, or env
        const apiKey = await getGeminiApiKey(req);

        if (!apiKey) {
            console.log('No API key found, using fallback work description generator');
            const fallbackDescriptions = generateFallbackWorkDescriptions(jobTitle, employer, targetLanguage);
            return res.json({ suggestions: fallbackDescriptions });
        }

        // Initialize the Gemini API
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // Create a comprehensive prompt for work experience descriptions
        const duration = startDate && (endDate || current) ? `from ${startDate} to ${current ? 'present' : endDate}` : 'for the specified period';

        const prompt = `
        You are a Fortune 500 Senior Recruiter and Executive Resume Editor. Generate 3 different professional work experience descriptions for a ${jobTitle} position at ${employer} ${duration}.
        
        CRITICAL REQUIREMENT: You MUST write everything in ${targetLanguage}. Do NOT use English if the target language is not English.
        ${targetLanguage === 'Spanish' ? 'ESCRIBIR EN ESPAÑOL SOLAMENTE. NO USAR INGLÉS.' : ''}
        ${targetLanguage === 'French' ? "ÉCRIRE EN FRANÇAIS SEULEMENT. NE PAS UTILISER L'ANGLAIS." : ''}
        
        LANGUAGE: ${targetLanguage}
        TARGET LANGUAGE: ${targetLanguage}
        WRITE IN: ${targetLanguage}
        RESPONSE LANGUAGE: ${targetLanguage}
        
        CRITICAL 10/10 NATURAL HUMAN VOICE GUIDELINES:
        1. SOUND LIKE A REAL HUMAN ENGINEER / PROFESSIONAL: Write direct, concise, down-to-earth bullet points. BAN inflated AI linking clauses like "thereby increasing...", "achieving a significant reduction in...", "fostering seamless collaboration...". State the work done and the direct outcome cleanly.
        2. ACTION-FIRST STRUCTURE: Start directly with strong action verbs (Built, Designed, Wrote, Cut, Shipped, Automated, Managed, Developed, Migrated, Integrated).
        3. STRICT ANTI-AI BUZZWORD BAN: NEVER use robotic AI cliché words ("spearheaded", "leveraged", "utilize", "fostered", "synergy", "tapestry", "beacon", "testament", "thereby", "spearhead", "leverage").
        4. NO PLACEHOLDERS: NEVER output bracketed placeholders like "[insert percentage]" or "[X]". Write complete, ready-to-use bullet points.
        5. STRICT NO-HALLUCINATED-LOCATIONS DIRECTIVE: NEVER invent or add fictitious city names or branch offices (such as "San Francisco branch", "New York office", "Silicon Valley team") unless explicitly provided by the candidate! If no location/city was specified, refer strictly to "${employer}" directly without adding any branch or city name.
        6. EVERY SINGLE WORD must be written in ${targetLanguage}.
        
        Format the response as a JSON array with exactly 3 descriptions, each as a single string with bullet points separated by newlines.
        
        Example format (in ${targetLanguage}):
        [
            "• [First direct achievement in ${targetLanguage}]\n• [Second direct achievement in ${targetLanguage}]\n• [Third direct achievement in ${targetLanguage}]",
            "• [Different first achievement in ${targetLanguage}]\n• [Different second achievement in ${targetLanguage}]\n• [Different third achievement in ${targetLanguage}]",
            "• [Another achievement in ${targetLanguage}]\n• [Another achievement in ${targetLanguage}]\n• [Another achievement in ${targetLanguage}]"
        ]
        
        Only return the JSON array without any explanation or additional text.
        `;

        console.log('Sending prompt to AI with target language:', targetLanguage);
        console.log('Prompt preview:', prompt.substring(0, 200) + '...');

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log('AI response received for language', targetLanguage + ':', text.substring(0, 300) + '...');

        // Parse the JSON response
        let jsonText = text;
        if (text.includes('```json')) {
            jsonText = text.split('```json')[1].split('```')[0].trim();
        } else if (text.includes('```')) {
            jsonText = text.split('```')[1].split('```')[0].trim();
        }

        try {
            const descriptions = JSON.parse(jsonText);

            if (Array.isArray(descriptions) && descriptions.length > 0) {
                console.log('Successfully generated AI work descriptions for language:', targetLanguage);
                console.log('First description preview:', descriptions[0].substring(0, 100) + '...');
                res.json({ suggestions: descriptions });
            } else {
                console.log('Invalid AI response format, using fallback');
                const fallbackDescriptions = generateFallbackWorkDescriptions(jobTitle, employer, targetLanguage);
                res.json({ suggestions: fallbackDescriptions });
            }
        } catch (parseError) {
            console.error('Failed to parse JSON from AI response:', parseError);
            const fallbackDescriptions = generateFallbackWorkDescriptions(jobTitle, employer, targetLanguage);
            res.json({ suggestions: fallbackDescriptions });
        }
    } catch (error) {
        console.error('Error generating AI work descriptions:', error);
        // Use fallback method if AI generation fails
        const { jobTitle, employer, language = 'en' } = req.body;
        const languageNames = {
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            nl: 'Dutch',
            pl: 'Polish',
            se: 'Swedish',
            no: 'Norwegian',
            dk: 'Danish',
            is: 'Icelandic',
            gk: 'Greek',
            ro: 'Romanian',
        };
        const targetLanguage = languageNames[language] || 'English';
        const fallbackDescriptions = generateFallbackWorkDescriptions(jobTitle, employer, targetLanguage);
        res.json({ suggestions: fallbackDescriptions });
    }
});

// Generate education descriptions endpoint
router.post('/generate-education-description', async (req, res) => {
    try {
        const { school, degree, startDate, endDate, current, language = 'en' } = req.body;

        console.log('Received education description request with language:', language);
        console.log('Full request body:', req.body);

        if (!school || !degree) {
            return res.status(400).json({ error: 'School and degree are required' });
        }

        // Language mapping for proper language names in prompt
        const languageNames = {
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            nl: 'Dutch',
            pl: 'Polish',
            se: 'Swedish',
            no: 'Norwegian',
            dk: 'Danish',
            is: 'Icelandic',
            gk: 'Greek',
            ro: 'Romanian',
        };

        const targetLanguage = languageNames[language] || 'English';
        console.log('Target language mapped to:', targetLanguage);

        // Check for API key from request body, headers, or env
        const apiKey = await getGeminiApiKey(req);

        if (!apiKey) {
            console.log('No API key found, using fallback education description generator');
            const fallbackDescriptions = generateFallbackEducationDescriptions(school, degree, targetLanguage);
            return res.json({ suggestions: fallbackDescriptions });
        }

        // Initialize the Gemini API
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // Create a comprehensive prompt for education descriptions
        const duration = startDate && (endDate || current) ? `from ${startDate} to ${current ? 'present' : endDate}` : 'during the study period';

        const prompt = `
        You are a professional resume writer. Generate 3 different professional education descriptions for a ${degree} degree at ${school} ${duration}.
        
        CRITICAL REQUIREMENT: You MUST write everything in ${targetLanguage}. Do NOT use English if the target language is not English.
        ${targetLanguage === 'Spanish' ? 'ESCRIBIR EN ESPAÑOL SOLAMENTE. NO USAR INGLÉS.' : ''}
        ${targetLanguage === 'French' ? "ÉCRIRE EN FRANÇAIS SEULEMENT. NE PAS UTILISER L'ANGLAIS." : ''}
        
        LANGUAGE: ${targetLanguage}
        TARGET LANGUAGE: ${targetLanguage}
        WRITE IN: ${targetLanguage}
        RESPONSE LANGUAGE: ${targetLanguage}
        
        Each description should:
        - Be 3-4 bullet points long
        - Include relevant coursework, academic achievements, honors, projects, or extracurricular activities in ${targetLanguage}
        - Mention GPA, Dean's List, honors, or academic recognition where appropriate
        - Include relevant projects, internships, or practical experience gained during studies
        - Be tailored specifically to the ${degree} field of study
        - Sound professional and highlight academic accomplishments in ${targetLanguage}
        - Focus on achievements and learning outcomes rather than just coursework lists
        - Be unique and distinct from the other descriptions
        - EVERY SINGLE WORD must be written in ${targetLanguage}
        
        If the target language is Spanish (${targetLanguage}), use Spanish words, grammar, and structure.
        If the target language is French (${targetLanguage}), use French words, grammar, and structure.
        
        Format the response as a JSON array with exactly 3 descriptions, each as a single string with bullet points separated by newlines.
        
        Example format (but write in ${targetLanguage}):
        [
            "• [First achievement in ${targetLanguage}]\n• [Second achievement in ${targetLanguage}]\n• [Third achievement in ${targetLanguage}]",
            "• [Different first achievement in ${targetLanguage}]\n• [Different second achievement in ${targetLanguage}]\n• [Different third achievement in ${targetLanguage}]",
            "• [Another different achievement in ${targetLanguage}]\n• [Another achievement in ${targetLanguage}]\n• [Another achievement in ${targetLanguage}]"
        ]
        
        Remember: Write EVERYTHING in ${targetLanguage}. Do not mix languages.
        Only return the JSON array without any explanation or additional text.
        `;

        console.log('Sending education prompt to AI with target language:', targetLanguage);
        console.log('Education prompt preview:', prompt.substring(0, 200) + '...');

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log('AI education response received for language', targetLanguage + ':', text.substring(0, 300) + '...');

        // Parse the JSON response
        let jsonText = text;
        if (text.includes('```json')) {
            jsonText = text.split('```json')[1].split('```')[0].trim();
        } else if (text.includes('```')) {
            jsonText = text.split('```')[1].split('```')[0].trim();
        }

        try {
            const descriptions = JSON.parse(jsonText);

            if (Array.isArray(descriptions) && descriptions.length > 0) {
                console.log('Successfully generated AI education descriptions for language:', targetLanguage);
                console.log('First education description preview:', descriptions[0].substring(0, 100) + '...');
                res.json({ suggestions: descriptions });
            } else {
                console.log('Invalid AI response format, using fallback');
                const fallbackDescriptions = generateFallbackEducationDescriptions(school, degree, targetLanguage);
                res.json({ suggestions: fallbackDescriptions });
            }
        } catch (parseError) {
            console.error('Failed to parse JSON from AI response:', parseError);
            const fallbackDescriptions = generateFallbackEducationDescriptions(school, degree, targetLanguage);
            res.json({ suggestions: fallbackDescriptions });
        }
    } catch (error) {
        console.error('Error generating AI education descriptions:', error);
        // Use fallback method if AI generation fails
        const { school, degree, language = 'en' } = req.body;
        const languageNames = {
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            nl: 'Dutch',
            pl: 'Polish',
            se: 'Swedish',
            no: 'Norwegian',
            dk: 'Danish',
            is: 'Icelandic',
            gk: 'Greek',
            ro: 'Romanian',
        };
        const targetLanguage = languageNames[language] || 'English';
        const fallbackDescriptions = generateFallbackEducationDescriptions(school, degree, targetLanguage);
        res.json({ suggestions: fallbackDescriptions });
    }
});

// Fallback summary generator in case the AI call fails
function generateFallbackSummary(name, jobTitle, experience, skills, achievement, summaryType, targetLanguage = 'English') {
    // Clean experience text for natural phrase insertion
    let cleanExp = experience || '3+ years';
    if (typeof cleanExp === 'string' && (cleanExp.length > 25 || cleanExp.includes(' at ') || cleanExp.includes(';'))) {
        cleanExp = 'several years';
    }

    // Create a simplified version of skills for template
    const skillsList =
        typeof skills === 'string'
            ? skills
                  .split(',')
                  .slice(0, 3)
                  .map((s) => s.trim())
                  .join(', ')
            : 'various industry-relevant skills';

    // Extract first name for more natural templates
    const firstName = name ? name.split(' ')[0] : 'professional';

    // Templates for different languages
    const templates = {
        English: {
            professional: [
                `I am a dedicated ${jobTitle} with ${cleanExp} of experience in the field. Skilled in ${skillsList}, I have successfully demonstrated core competencies across key projects. Known for my technical precision and commitment to excellence, I bring valuable insights and proven results to any organization.`,
                `I am an experienced ${jobTitle} with ${cleanExp} of professional expertise. I specialize in ${skillsList} and have a track record of driving impactful results. I am passionate about delivering high-quality solutions and organizational success through strategic thinking.`,
                `I am a results-driven ${jobTitle} bringing ${cleanExp} of industry experience. With expertise in ${skillsList}, I have demonstrated exceptional technical leadership and execution. I am committed to continuous learning and professional growth while contributing to team success.`,
            ],
            creative: [
                `Blending creativity with technical prowess, I have spent ${experience} crafting success as a ${jobTitle}. A master of ${skillsList}, I transform challenges into opportunities, notably when I ${achievement}. Every project becomes my canvas for innovation and excellence.`,
                `Reimagining what's possible as a ${jobTitle}, I bring ${experience} of boundary-pushing expertise to the table. Wielding skills in ${skillsList} like artistic tools, I create solutions that inspire, evidenced by my ${achievement}. I am ready to bring fresh perspectives to your next big challenge.`,
                `In the evolving landscape of ${jobTitle}s, I stand out with ${experience} of visionary work. Artfully combining ${skillsList}, I craft experiences that resonate and deliver results, particularly when I ${achievement}. Innovation meets practicality in everything I touch.`,
            ],
            achievement: [
                `I am a results-focused ${jobTitle} with ${experience} of measurable success. I notably ${achievement}, utilizing my expertise in ${skillsList}. I consistently exceed targets and transform challenges into quantifiable victories, bringing my proven track record of success to every initiative.`,
                `I am an achievement-driven ${jobTitle} with ${experience} of documented success. I have demonstrably improved outcomes when ${achievement}, leveraging my specialized skills in ${skillsList}. I am known for data-backed results and significant contributions to organizational goals.`,
                `I deliver exceptional ROI as a ${jobTitle} with ${experience} in the field. My quantifiable achievements include ${achievement}, made possible through my mastery of ${skillsList}. I have a track record of measurable impact, consistently turning strategies into tangible business outcomes.`,
            ],
        },
        French: {
            professional: [
                `Je suis un ${jobTitle} dévoué avec ${experience} d'expérience dans le domaine. Compétent en ${skillsList}, j'ai réussi à ${achievement}. Connu pour mon expertise et mon engagement envers l'excellence, j'apporte des idées précieuses et des résultats éprouvés à toute organisation.`,
                `Je suis un ${jobTitle} expérimenté avec ${experience} d'expertise professionnelle. Je me spécialise en ${skillsList} et j'ai un historique de ${achievement}. Je suis passionné par la livraison de résultats de haute qualité et le succès organisationnel grâce à des solutions innovantes.`,
                `Je suis un ${jobTitle} axé sur les résultats apportant ${experience} d'expérience industrielle. Avec une expertise en ${skillsList}, j'ai démontré une capacité exceptionnelle en ${achievement}. Je suis engagé dans l'apprentissage continu et la croissance professionnelle.`,
            ],
            creative: [
                `Alliant créativité et expertise technique, j'ai passé ${experience} à façonner le succès en tant que ${jobTitle}. Maître de ${skillsList}, je transforme les défis en opportunités, notamment quand j'ai ${achievement}. Chaque projet devient ma toile pour l'innovation et l'excellence.`,
                `Réinventant ce qui est possible en tant que ${jobTitle}, j'apporte ${experience} d'expertise révolutionnaire. Maniant les compétences en ${skillsList} comme des outils artistiques, je crée des solutions qui inspirent, comme en témoigne mon ${achievement}.`,
                `Dans le paysage évolutif des ${jobTitle}s, je me démarque avec ${experience} de travail visionnaire. Combinant artísticement ${skillsList}, je crée des expériences qui résonnent et livrent des résultats, particularly when I ${achievement}.`,
            ],
            achievement: [
                `Je suis un ${jobTitle} axé sur les résultats avec ${experience} de succès mesurable. J'ai notamment ${achievement}, utilisant mon expertise en ${skillsList}. Je dépasse constamment les objectifs et transforme les défis en victoires quantifiables.`,
                `Je suis un ${jobTitle} orienté réalisations avec ${experience} de succès documenté. J'ai considérablement amélioré les résultats quand j'ai ${achievement}, tirant parti de mes compétences spécialisées en ${skillsList}.`,
                `Je livre un ROI exceptionnel en tant que ${jobTitle} avec ${experience} dans le domaine. Mes réalisations quantifiables incluent ${achievement}, rendues possibles grâce à ma maîtrise de ${skillsList}.`,
            ],
        },
        Spanish: {
            professional: [
                `Soy un ${jobTitle} dedicado con ${experience} de experiencia en el campo. Hábil en ${skillsList}, he logrado con éxito ${achievement}. Conocido por mi experiencia y compromiso con la excelencia, aporto ideas valiosas y resultados probados a cualquier organización.`,
                `Soy un ${jobTitle} experimentado con ${experience} de experiencia profesional. Me especializo en ${skillsList} y tengo un historial de ${achievement}. Soy apasionado por entregar resultados de alta calidad e impulsar el éxito organizacional a través de soluciones innovadoras.`,
                `Soy un ${jobTitle} orientado a resultados que aporta ${experience} de experiencia en la industria. Con experiencia en ${skillsList}, he demostrado capacidad excepcional en ${achievement}. Estoy comprometido con el aprendizaje continuo y el crecimiento profesional.`,
            ],
            creative: [
                `Combinando creatividad con destreza técnica, he pasado ${experience} forjando el éxito como ${jobTitle}. Maestro de ${skillsList}, transformo desafíos en oportunidades, especialmente cuando logré ${achievement}. Cada proyecto se convierte en mi lienzo para la innovación y la excelencia.`,
                `Reimaginando lo que es posible como ${jobTitle}, aporto ${experience} de experiencia revolucionaria. Manejando habilidades en ${skillsList} como herramientas artísticas, creo soluciones que inspiran, evidenciado por mi ${achievement}.`,
                `En el panorama evolutivo de ${jobTitle}s, me destaco con ${experience} de trabajo visionario. Combinando artísticamente ${skillsList}, creo experiencias que resuenan y entregan resultados, particularmente cuando logré ${achievement}.`,
            ],
            achievement: [
                `Soy un ${jobTitle} enfocado en resultados con ${experience} de éxito medible. Notablemente logré ${achievement}, utilizando mi experiencia en ${skillsList}. Consistentemente supero objetivos y transformo desafíos en victorias cuantificables.`,
                `Soy un ${jobTitle} impulsado por logros con ${experience} de éxito documentado. He mejorado demostrablemente los resultados cuando logré ${achievement}, aprovechando mis habilidades especializadas en ${skillsList}.`,
                `Entrego ROI excepcional como ${jobTitle} con ${experience} en el campo. Mis logros cuantificables incluyen ${achievement}, hechos posibles a través de mi dominio de ${skillsList}.`,
            ],
        },
    };

    // Get templates for the target language or default to English
    const languageTemplates = templates[targetLanguage] || templates['English'];

    // Default to professional if type not specified or invalid
    const type = languageTemplates[summaryType] ? summaryType : 'professional';

    // Select a random template from the appropriate category
    const randomIndex = Math.floor(Math.random() * languageTemplates[type].length);
    return languageTemplates[type][randomIndex];
}

// Fallback function to generate interview questions when API fails
const generateDefaultInterview = (occupation, interviewType, questionCount = 10, targetLanguage = 'English') => {
    // Format occupation for use in questions
    const formattedOccupation = occupation.charAt(0).toUpperCase() + occupation.slice(1);

    // Default technical questions for any occupation
    const technicalQuestions = [
        {
            id: 1,
            question: `What tools or technologies are you most proficient with as a ${occupation}?`,
            options: [
                'I focus mainly on industry-standard tools with deep expertise in a few key technologies',
                'I prefer to learn many different tools at a basic level',
                'I only use tools when absolutely necessary',
                'I prefer to build my own custom tools rather than use existing ones',
            ],
            correctAnswer: 0,
            category: 'Technical Skills',
            difficulty: 'Easy',
            explanation: 'Successful professionals typically develop deep expertise with industry-standard tools while maintaining awareness of alternatives.',
            estimatedTime: 90,
        },
        {
            id: 2,
            question: `How do you stay updated with the latest developments in the ${occupation} field?`,
            options: [
                'I wait for my employer to provide training',
                'I follow industry blogs, attend conferences, and participate in professional communities',
                'I learn only when required for a specific project',
                'I focus on what I already know well',
            ],
            correctAnswer: 1,
            category: 'Professional Development',
            difficulty: 'Easy',
            explanation: 'Proactive learning through multiple channels demonstrates commitment to professional growth and staying current in the field.',
            estimatedTime: 80,
        },
        {
            id: 3,
            question: `How do you approach problem-solving in your role as a ${occupation}?`,
            options: [
                'I immediately ask others for help',
                "I apply only solutions I've used before",
                'I use a systematic approach: define the problem, analyze causes, consider alternatives, implement and evaluate',
                'I rely primarily on intuition',
            ],
            correctAnswer: 2,
            category: 'Problem Solving',
            difficulty: 'Intermediate',
            explanation: 'A structured approach to problem-solving is most effective for addressing complex challenges in a professional environment.',
            estimatedTime: 100,
        },
        {
            id: 4,
            question: `What metrics or KPIs do you consider most important for measuring success as a ${occupation}?`,
            options: ['Hours worked', 'Personal recognition', 'Outcome-based metrics aligned with business objectives', 'Number of tasks completed'],
            correctAnswer: 2,
            category: 'Performance Measurement',
            difficulty: 'Intermediate',
            explanation: 'Effective professionals focus on outcome-based metrics that demonstrate actual value to the organization rather than activity metrics.',
            estimatedTime: 110,
        },
        {
            id: 5,
            question: `What approach do you take when implementing new methodologies or processes in your work?`,
            options: [
                'I resist change and stick with what I know',
                'I research, test on a small scale, measure results, and then implement more broadly if effective',
                'I immediately implement across all projects',
                'I follow whatever approach is trending regardless of its applicability',
            ],
            correctAnswer: 1,
            category: 'Methodologies',
            difficulty: 'Advanced',
            explanation: 'A measured, evidence-based approach to implementing new methods demonstrates critical thinking and risk management.',
            estimatedTime: 120,
        },
    ];

    // Default behavioral questions for any occupation
    const behavioralQuestions = [
        {
            id: 1,
            question: 'How do you handle conflicts within your team?',
            options: [
                'Avoid confrontation and hope it resolves itself',
                'Listen to all parties, facilitate discussion, and find common ground',
                'Always side with the senior team member',
                'Escalate immediately to management',
            ],
            correctAnswer: 1,
            category: 'Conflict Resolution',
            difficulty: 'Intermediate',
            explanation: 'Effective conflict resolution involves active listening, understanding all perspectives, and collaborative problem-solving.',
            estimatedTime: 120,
        },
        {
            id: 2,
            question: 'Describe how you prioritize tasks when facing multiple deadlines.',
            options: [
                'I work on whatever task I feel like at the moment',
                'I focus on the most urgent task regardless of importance',
                'I evaluate both urgency and importance, communicate with stakeholders, and adjust plans as needed',
                'I simply work longer hours to complete everything',
            ],
            correctAnswer: 2,
            category: 'Time Management',
            difficulty: 'Intermediate',
            explanation: 'Strategic prioritization based on both urgency and importance, while maintaining communication, demonstrates effective time management.',
            estimatedTime: 100,
        },
        {
            id: 3,
            question: 'How do you respond to feedback about your work?',
            options: [
                'I take it personally and become defensive',
                'I listen actively, thank the person, reflect on the feedback, and determine appropriate actions for improvement',
                "I ignore feedback that doesn't align with my self-perception",
                'I agree with all feedback regardless of its validity',
            ],
            correctAnswer: 1,
            category: 'Adaptability',
            difficulty: 'Easy',
            explanation: 'A growth mindset involves being open to feedback and using it constructively for professional development.',
            estimatedTime: 90,
        },
        {
            id: 4,
            question: 'Describe a situation where you had to adapt to a significant change at work.',
            options: [
                "I've never had to adapt to changes",
                'I resist change until forced to comply',
                'I understand the reason for change, identify opportunities, develop new skills, and help others adapt',
                'I switch jobs whenever significant changes occur',
            ],
            correctAnswer: 2,
            category: 'Change Management',
            difficulty: 'Intermediate',
            explanation: 'Adaptability involves understanding the context of change, finding opportunities, and supporting the transition process.',
            estimatedTime: 130,
        },
        {
            id: 5,
            question: 'How do you approach collaboration with colleagues from different departments?',
            options: [
                'I avoid cross-department collaboration whenever possible',
                "I insist they adapt to my department's methods and terminology",
                'I build relationships, learn about their perspectives, establish common goals, and create clear communication channels',
                'I let management handle all cross-department coordination',
            ],
            correctAnswer: 2,
            category: 'Collaboration',
            difficulty: 'Intermediate',
            explanation: 'Effective cross-functional collaboration involves relationship building, empathy, and establishing shared objectives and communication methods.',
            estimatedTime: 110,
        },
    ];

    // Select appropriate questions based on interview type
    const questions = interviewType === 'technical' ? technicalQuestions : behavioralQuestions;

    // Fill remaining questions from the other category to have 10 questions total
    const remainingQuestions =
        interviewType === 'technical' ? behavioralQuestions.slice(0, 5).map((q, i) => ({ ...q, id: i + 6 })) : technicalQuestions.slice(0, 5).map((q, i) => ({ ...q, id: i + 6 }));

    const allQuestions = [...questions, ...remainingQuestions];

    // Create appropriate categories based on questions
    const categories = [...new Set(allQuestions.map((q) => q.category))];

    return {
        title: `${formattedOccupation} Position - ${interviewType === 'technical' ? 'Technical' : 'Behavioral'} Assessment`,
        company: 'Professional Evaluation Services',
        department: interviewType === 'technical' ? 'Technical Department' : 'Human Resources',
        duration: '30 minutes',
        totalQuestions: allQuestions.length,
        passingScore: 70,
        categories,
        questions: allQuestions,
    };
};

// Fallback function to generate work descriptions when AI is not available
const generateFallbackWorkDescriptions = (jobTitle, employer, targetLanguage = 'English') => {
    // Create base templates for different types of achievements in different languages
    const achievementTemplates = {
        English: [
            {
                category: 'leadership',
                templates: [
                    `• Led cross-functional teams of 5-12 professionals to deliver high-impact projects, resulting in 25-40% improvement in efficiency\n• Implemented strategic initiatives and process improvements that enhanced team productivity and collaboration\n• Mentored junior team members and conducted performance evaluations, contributing to professional development and retention`,

                    `• Managed and coordinated multiple project streams simultaneously, ensuring on-time delivery within budget constraints\n• Established clear communication channels and reporting structures that improved stakeholder satisfaction by 30%\n• Developed training programs and onboarding processes that reduced new employee ramp-up time by 50%`,
                ],
            },
            {
                category: 'technical',
                templates: [
                    `• Developed and implemented innovative solutions using cutting-edge technologies, serving over 10,000+ users\n• Optimized system performance and reduced processing time by 35% through strategic code refactoring and database optimization\n• Collaborated with product teams to translate business requirements into scalable technical architectures`,

                    `• Designed and built robust applications and systems that improved operational efficiency by 40%\n• Established coding standards and best practices that were adopted across the engineering organization\n• Conducted code reviews and technical documentation, ensuring high-quality deliverables and knowledge transfer`,
                ],
            },
            {
                category: 'business',
                templates: [
                    `• Drove business growth initiatives that resulted in 20-30% increase in revenue and market expansion\n• Analyzed market trends and customer data to identify opportunities and optimize business strategies\n• Built strategic partnerships and client relationships that generated $500K+ in new business opportunities`,

                    `• Streamlined business processes and implemented efficiency improvements that reduced costs by 25%\n• Developed comprehensive reports and presentations for executive leadership and key stakeholders\n• Managed client relationships and resolved complex issues, maintaining 95%+ customer satisfaction rates`,
                ],
            },
        ],
        Spanish: [
            {
                category: 'leadership',
                templates: [
                    `• Lideré equipos multifuncionales de 5-12 profesionales para entregar proyectos de alto impacto, resultando en 25-40% de mejora en eficiencia\n• Implementé iniciativas estratégicas y mejoras de procesos que aumentaron la productividad del equipo y la colaboración\n• Mentoreé a miembros júnior del equipo y realicé evaluaciones de desempeño, contribuyendo al desarrollo profesional y retención`,

                    `• Gestioné y coordiné múltiples flujos de proyectos simultáneamente, asegurando entrega a tiempo dentro de restricciones presupuestarias\n• Establecí canales de comunicación claros y estructuras de reporte que mejoraron la satisfacción de stakeholders en 30%\n• Desarrollé programas de entrenamiento y procesos de incorporación que redujeron el tiempo de adaptación de nuevos empleados en 50%`,
                ],
            },
            {
                category: 'technical',
                templates: [
                    `• Desarrollé e implementé soluciones innovadoras usando tecnologías de vanguardia, sirviendo a más de 10,000+ usuarios\n• Optimicé el rendimiento del sistema y reduje el tiempo de procesamiento en 35% mediante refactorización estratégica de código y optimización de base de datos\n• Colaboré con equipos de producto para traducir requisitos de negocio en arquitecturas técnicas escalables`,

                    `• Diseñé y construí aplicaciones y sistemas robustos que mejoraron la eficiencia operativa en 40%\n• Establecí estándares de codificación y mejores prácticas que fueron adoptadas en toda la organización de ingeniería\n• Realicé revisiones de código y documentación técnica, asegurando entregas de alta calidad y transferencia de conocimiento`,
                ],
            },
            {
                category: 'business',
                templates: [
                    `• Impulsé iniciativas de crecimiento empresarial que resultaron en 20-30% de aumento en ingresos y expansión de mercado\n• Analicé tendencias de mercado y datos de clientes para identificar oportunidades y optimizar estrategias empresariales\n• Construí asociaciones estratégicas y relaciones con clientes que generaron $500K+ en nuevas oportunidades de negocio`,

                    `• Optimicé procesos empresariales e implementé mejoras de eficiencia que redujeron costos en 25%\n• Desarrollé informes y presentaciones integrales para liderazgo ejecutivo y stakeholders clave\n• Gestioné relaciones con clientes y resolví problemas complejos, manteniendo tasas de satisfacción del cliente del 95%+`,
                ],
            },
        ],
        French: [
            {
                category: 'leadership',
                templates: [
                    `• Dirigé des équipes transfonctionnelles de 5-12 professionnels pour livrer des projets à fort impact, résultant en 25-40% d'amélioration de l'efficacité\n• Mis en œuvre des initiatives stratégiques et des améliorations de processus qui ont renforcé la productivité et la collaboration de l'équipe\n• Mentoré les membres juniors de l'équipe et mené des évaluations de performance, contribuant au développement professionnel et à la rétention`,

                    `• Géré et coordonné plusieurs flux de projets simultanément, assurant une livraison dans les délais et dans les contraintes budgétaires\n• Établi des canaux de communication clairs et des structures de rapport qui ont amélioré la satisfaction des parties prenantes de 30%\n• Développé des programmes de formation et des processus d'intégration qui ont réduit le temps d'adaptation des nouveaux employés de 50%`,
                ],
            },
            {
                category: 'technical',
                templates: [
                    `• Développé et mis en œuvre des solutions innovantes utilisant des technologies de pointe, servant plus de 10,000+ utilisateurs\n• Optimisé les performances du système et réduit le temps de traitement de 35% grâce à la refactorisation stratégique du code et l'optimisation de base de données\n• Collaboré avec les équipes produit pour traduire les exigences métier en architectures techniques évolutives`,

                    `• Conçu et construit des applications et systèmes robustes qui ont amélioré l'efficacité opérationnelle de 40%\n• Établi des standards de codage et des meilleures pratiques qui ont été adoptés dans toute l'organisation d'ingénierie\n• Effectué des revues de code et de la documentation technique, assurant des livrables de haute qualité et le transfert de connaissances`,
                ],
            },
            {
                category: 'business',
                templates: [
                    `• Mené des initiatives de croissance d'entreprise qui ont résulté en 20-30% d'augmentation des revenus et d'expansion du marché\n• Analysé les tendances du marché et les données clients pour identifier les opportunités et optimiser les stratégies d'entreprise\n• Construit des partenariats stratégiques et des relations clients qui ont généré $500K+ en nouvelles opportunités d'affaires`,

                    `• Rationalisé les processus d'entreprise et mis en œuvre des améliorations d'efficacité qui ont réduit les coûts de 25%\n• Développé des rapports et présentations complets pour la direction exécutive et les parties prenantes clés\n• Géré les relations clients et résolu des problèmes complexes, maintenant des taux de satisfaction client de 95%+`,
                ],
            },
        ],
    };

    // Get templates for the target language or default to English
    const languageTemplates = achievementTemplates[targetLanguage] || achievementTemplates['English'];

    // Determine which category fits best based on job title
    let selectedCategory = 'business'; // default

    const jobLower = jobTitle.toLowerCase();
    if (
        jobLower.includes('developer') ||
        jobLower.includes('engineer') ||
        jobLower.includes('programmer') ||
        jobLower.includes('architect') ||
        jobLower.includes('technical') ||
        jobLower.includes('software')
    ) {
        selectedCategory = 'technical';
    } else if (jobLower.includes('manager') || jobLower.includes('director') || jobLower.includes('lead') || jobLower.includes('supervisor') || jobLower.includes('head')) {
        selectedCategory = 'leadership';
    }

    // Get templates for the selected category
    const categoryTemplates = languageTemplates.find((cat) => cat.category === selectedCategory);
    const templates = categoryTemplates ? categoryTemplates.templates : languageTemplates[2].templates; // fallback to business

    // Create third description with customizable text for different languages
    let thirdDescription;
    if (targetLanguage === 'Spanish') {
        thirdDescription = `• Entregué exitosamente las responsabilidades de ${jobTitle} en ${employer}, logrando mejoras medibles en áreas clave de desempeño\n• Colaboré con stakeholders para implementar soluciones que mejoraron la efectividad organizacional y satisfacción del cliente\n• Contribuí al éxito del equipo mediante enfoques innovadores y compromiso con la excelencia en todos los entregables del proyecto`;
    } else if (targetLanguage === 'French') {
        thirdDescription = `• Livré avec succès les responsabilités de ${jobTitle} chez ${employer}, réalisant des améliorations mesurables dans les domaines de performance clés\n• Collaboré avec les parties prenantes pour implémenter des solutions qui ont amélioré l'efficacité organisationnelle et la satisfaction client\n• Contribué au succès de l'équipe grâce à des approches innovantes et un engagement envers l'excellence dans tous les livrables de projet`;
    } else {
        thirdDescription = `• Successfully delivered ${jobTitle} responsibilities at ${employer}, achieving measurable improvements in key performance areas\n• Collaborated with stakeholders to implement solutions that enhanced organizational effectiveness and client satisfaction\n• Contributed to team success through innovative approaches and commitment to excellence in all project deliverables`;
    }

    // Create variations by mixing and matching different achievement types
    const descriptions = [
        templates[0], // First template as-is
        templates[1], // Second template as-is
        thirdDescription, // Customized third description
    ];

    return descriptions;
};

// Fallback function to generate education descriptions when AI is not available
const generateFallbackEducationDescriptions = (school, degree, targetLanguage = 'English') => {
    // Create base templates for different types of educational achievements in different languages
    const educationTemplates = {
        English: [
            {
                category: 'technical',
                templates: [
                    `• Completed comprehensive coursework in ${degree} fundamentals including advanced programming, software engineering, and system design\n• Achieved Dean's List recognition for maintaining GPA above 3.7 throughout academic career\n• Led senior capstone project developing innovative solutions using modern technologies, serving 500+ users`,

                    `• Graduated Magna Cum Laude with specialization in cutting-edge technologies and methodologies\n• Completed advanced coursework in database systems, web development, and mobile application development\n• Participated in hackathons and coding competitions, placing top 10 in regional programming contests`,

                    `• Earned degree with focus on emerging technologies and industry best practices\n• Completed internship at leading tech company, contributing to development of critical systems and protocols\n• Active member of technical societies, organizing workshops and guest speaker events for fellow students`,
                ],
            },
            {
                category: 'business',
                templates: [
                    `• Completed rigorous ${degree} curriculum with focus on strategic management, finance, and organizational behavior\n• Achieved academic excellence with cumulative GPA of 3.8+ and recognition on Dean's List multiple semesters\n• Led student consulting projects for local businesses, delivering actionable recommendations that improved operations by 20%`,

                    `• Graduated Summa Cum Laude with concentration in business analytics and market research methodologies\n• Completed advanced coursework in international business, digital marketing, and entrepreneurship\n• Founded student entrepreneurship club, organizing networking events and pitch competitions for 200+ participants`,

                    `• Earned degree with emphasis on leadership development and cross-functional team management\n• Completed competitive internship program at Fortune 500 company, contributing to strategic planning initiatives\n• Served as student body representative, advocating for academic policy improvements and student services enhancement`,
                ],
            },
            {
                category: 'liberal_arts',
                templates: [
                    `• Completed diverse ${degree} curriculum emphasizing critical thinking, communication, and analytical reasoning skills\n• Achieved academic honors with GPA above 3.6 and active participation in honor society programs\n• Conducted independent research project on contemporary issues, presenting findings at undergraduate research symposium`,

                    `• Graduated with distinction in ${degree} studies, developing strong writing and presentation capabilities\n• Completed interdisciplinary coursework spanning humanities, social sciences, and communication studies\n• Served as editor for student publication, managing editorial team and increasing readership by 40%`,

                    `• Earned degree with focus on cultural studies and global perspectives through study abroad programs\n• Maintained academic excellence while participating in multiple extracurricular leadership roles\n• Organized community service initiatives, coordinating volunteer efforts for local non-profit organizations`,
                ],
            },
        ],
        Spanish: [
            {
                category: 'technical',
                templates: [
                    `• Completé cursos integrales en fundamentos de ${degree} incluyendo programación avanzada, ingeniería de software y diseño de sistemas\n• Logré reconocimiento en Lista de Decano por mantener GPA superior a 3.7 durante toda mi carrera académica\n• Lideré proyecto final de carrera desarrollando soluciones innovadoras usando tecnologías modernas, sirviendo a 500+ usuarios`,

                    `• Me gradué Magna Cum Laude con especialización en tecnologías de vanguardia y metodologías\n• Completé cursos avanzados en sistemas de bases de datos, desarrollo web y desarrollo de aplicaciones móviles\n• Participé en hackathons y competencias de programación, ubicándome en el top 10 en concursos regionales de programación`,

                    `• Obtuve título con enfoque en tecnologías emergentes y mejores prácticas de la industria\n• Completé prácticas profesionales en empresa tecnológica líder, contribuyendo al desarrollo de sistemas y protocolos críticos\n• Miembro activo de sociedades técnicas, organizando talleres y eventos con oradores invitados para compañeros estudiantes`,
                ],
            },
            {
                category: 'business',
                templates: [
                    `• Completé riguroso programa de ${degree} con enfoque en gestión estratégica, finanzas y comportamiento organizacional\n• Logré excelencia académica con GPA acumulativo de 3.8+ y reconocimiento en Lista de Decano múltiples semestres\n• Lideré proyectos de consultoría estudiantil para empresas locales, entregando recomendaciones accionables que mejoraron operaciones en 20%`,

                    `• Me gradué Summa Cum Laude con concentración en analítica empresarial y metodologías de investigación de mercado\n• Completé cursos avanzados en negocios internacionales, marketing digital y emprendimiento\n• Fundé club de emprendimiento estudiantil, organizando eventos de networking y competencias de pitches para 200+ participantes`,

                    `• Obtuve título con énfasis en desarrollo de liderazgo y gestión de equipos multifuncionales\n• Completé programa competitivo de prácticas en empresa Fortune 500, contribuyendo a iniciativas de planificación estratégica\n• Serví como representante estudiantil, abogando por mejoras en políticas académicas y servicios estudiantiles`,
                ],
            },
            {
                category: 'liberal_arts',
                templates: [
                    `• Completé diverso currículo de ${degree} enfatizando pensamiento crítico, comunicación y habilidades de razonamiento analítico\n• Logré honores académicos con GPA superior a 3.6 y participación activa en programas de sociedad de honor\n• Realicé proyecto de investigación independiente sobre temas contemporáneos, presentando hallazgos en simposio de investigación de pregrado`,

                    `• Me gradué con distinción en estudios de ${degree}, desarrollando fuertes capacidades de escritura y presentación\n• Completé cursos interdisciplinarios abarcando humanidades, ciencias sociales y estudios de comunicación\n• Serví como editor de publicación estudiantil, gestionando equipo editorial y aumentando número de lectores en 40%`,

                    `• Obtuve título con enfoque en estudios culturales y perspectivas globales a través de programas de estudio en el extranjero\n• Mantuve excelencia académica mientras participaba en múltiples roles de liderazgo extracurricular\n• Organicé iniciativas de servicio comunitario, coordinando esfuerzos voluntarios para organizaciones locales sin fines de lucro`,
                ],
            },
        ],
        French: [
            {
                category: 'technical',
                templates: [
                    `• Complété des cours complets sur les fondamentaux de ${degree} incluant programmation avancée, génie logiciel et conception de systèmes\n• Obtenu reconnaissance sur la Liste du Doyen pour maintenir un GPA supérieur à 3.7 tout au long de ma carrière académique\n• Dirigé projet de fin d'études développant des solutions innovantes utilisant des technologies modernes, servant 500+ utilisateurs`,

                    `• Diplômé Magna Cum Laude avec spécialisation en technologies de pointe et méthodologies\n• Complété des cours avancés en systèmes de bases de données, développement web et développement d'applications mobiles\n• Participé à des hackathons et concours de programmation, classé top 10 dans les concours régionaux de programmation`,

                    `• Obtenu diplôme avec accent sur les technologies émergentes et les meilleures pratiques de l'industrie\n• Complété stage dans une entreprise technologique leader, contribuant au développement de systèmes et protocoles critiques\n• Membre actif de sociétés techniques, organisant ateliers et événements avec conférenciers invités pour étudiants`,
                ],
            },
            {
                category: 'business',
                templates: [
                    `• Complété programme rigoureux de ${degree} avec accent sur gestion stratégique, finance et comportement organisationnel\n• Atteint excellence académique avec GPA cumulatif de 3.8+ et reconnaissance sur Liste du Doyen plusieurs semestres\n• Dirigé projets de consultation étudiante pour entreprises locales, livrant recommandations actionnables qui ont amélioré opérations de 20%`,

                    `• Diplômé Summa Cum Laude avec concentration en analytique d'entreprise et méthodologies de recherche de marché\n• Complété cours avancés en affaires internationales, marketing numérique et entrepreneuriat\n• Fondé club d'entrepreneuriat étudiant, organisant événements de réseautage et compétitions de pitchs pour 200+ participants`,

                    `• Obtenu diplôme avec emphasis sur développement du leadership et gestion d'équipes interfonctionnelles\n• Complété programme compétitif de stage chez entreprise Fortune 500, contribuant aux initiatives de planification stratégique\n• Servi comme représentant étudiant, plaidant pour améliorations de politiques académiques et services étudiants`,
                ],
            },
            {
                category: 'liberal_arts',
                templates: [
                    `• Complété curriculum diversifié de ${degree} mettant l'accent sur pensée critique, communication et compétences de raisonnement analytique\n• Atteint honneurs académiques avec GPA supérieur à 3.6 et participation active dans programmes de société d'honneur\n• Mené projet de recherche indépendant sur enjeux contemporains, présentant résultats au symposium de recherche de premier cycle`,

                    `• Diplômé avec distinction en études de ${degree}, développant fortes capacités d'écriture et présentation\n• Complété cours interdisciplinaires couvrant humanités, sciences sociales et études de communication\n• Servi comme éditeur de publication étudiante, gérant équipe éditoriale et augmentant lectorat de 40%`,

                    `• Obtenu diplôme avec accent sur études culturelles et perspectives globales à travers programmes d'études à l'étranger\n• Maintenu excellence académique tout en participant à multiples rôles de leadership parascolaires\n• Organisé initiatives de service communautaire, coordonnant efforts bénévoles pour organisations locales à but non lucratif`,
                ],
            },
        ],
    };

    // Get templates for the target language or default to English
    const languageTemplates = educationTemplates[targetLanguage] || educationTemplates['English'];

    // Determine which category fits best based on degree
    let selectedCategory = 'liberal_arts'; // default

    const degreeLower = degree.toLowerCase();
    if (
        degreeLower.includes('computer') ||
        degreeLower.includes('engineering') ||
        degreeLower.includes('technology') ||
        degreeLower.includes('science') ||
        degreeLower.includes('mathematics') ||
        degreeLower.includes('software') ||
        degreeLower.includes('information')
    ) {
        selectedCategory = 'technical';
    } else if (
        degreeLower.includes('business') ||
        degreeLower.includes('management') ||
        degreeLower.includes('economics') ||
        degreeLower.includes('finance') ||
        degreeLower.includes('marketing') ||
        degreeLower.includes('administration')
    ) {
        selectedCategory = 'business';
    }

    // Get templates for the selected category
    const categoryTemplates = languageTemplates.find((cat) => cat.category === selectedCategory);
    const templates = categoryTemplates ? categoryTemplates.templates : languageTemplates[2].templates; // fallback to liberal_arts

    // Return all three templates with school name integrated based on language
    let descriptions;
    if (targetLanguage === 'Spanish') {
        descriptions = templates.map((template) => template.replace(/en empresa tecnológica líder|en empresa Fortune 500|a través de programas de estudio en el extranjero/, `en ${school}`));
    } else if (targetLanguage === 'French') {
        descriptions = templates.map((template) => template.replace(/dans une entreprise technologique leader|chez entreprise Fortune 500|à travers programmes d'études à l'étranger/, `à ${school}`));
    } else {
        descriptions = templates.map((template) => template.replace(/at leading tech company|at Fortune 500 company|through study abroad programs/, `at ${school}`));
    }

    return descriptions;
};

// Fallback generator in case the AI call fails
const generateDefaultResumeData = (occupation, experienceLevel, yearsOfExperience, positionTitle, currentYear, skills = [], education = [], targetLanguage) => {
    console.log('Using fallback generator with params:', { occupation, experienceLevel });

    // First name options
    const firstNames = ['James', 'Emma', 'Alex', 'Sarah', 'Michael', 'Jessica', 'David', 'Sophia', 'Robert', 'Olivia'];

    // Last name options
    const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez'];

    // Create a deterministic but random-seeming selection based on the occupation
    const occupationSeed = occupation.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);

    // Select names based on the occupation to ensure consistency for the same job title
    const firstName = firstNames[occupationSeed % firstNames.length];
    const lastName = lastNames[(occupationSeed + 3) % lastNames.length];

    // Email formats
    const emailDomains = ['gmail.com', 'outlook.com', 'yahoo.com', 'protonmail.com', 'mail.com'];
    const emailDomain = emailDomains[occupationSeed % emailDomains.length];
    const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${emailDomain}`;

    // Locations
    const locations = [
        { country: 'United States', city: 'New York', address: '123 Broadway Avenue' },
        { country: 'United States', city: 'Los Angeles', address: '456 Sunset Boulevard' },
        { country: 'United Kingdom', city: 'London', address: '10 Downing Street' },
        { country: 'Canada', city: 'Toronto', address: '567 Maple Road' },
    ];

    const location = locations[occupationSeed % locations.length];

    // Phone number generation (looks realistic but is fake)
    const areaCode = 100 + (occupationSeed % 900);
    const phoneMiddle = 100 + ((occupationSeed * 3) % 900);
    const phoneLast = 1000 + ((occupationSeed * 7) % 9000);
    const phone = `(${areaCode}) ${phoneMiddle}-${phoneLast.toString().substring(1)}`;

    // Generate keywords based on occupation
    const occupationKeywords = {
        developer: ['software architecture', 'code optimization', 'agile methodologies', 'full-stack development', 'technical leadership'],
        manager: ['team leadership', 'strategic planning', 'performance evaluation', 'process improvement', 'stakeholder communication'],
        designer: ['visual communication', 'creative direction', 'brand identity', 'user experience', 'digital media'],
        analyst: ['data analysis', 'research', 'reporting', 'problem-solving', 'critical thinking'],
        default: ['professional expertise', 'strategic thinking', 'collaborative approach', 'innovative solutions', 'continuous improvement'],
    };

    // Find matching keywords
    const relevantKeywords = Object.keys(occupationKeywords).filter((key) => occupation.toLowerCase().includes(key));
    const keywords = relevantKeywords.length > 0 ? relevantKeywords.flatMap((key) => occupationKeywords[key]) : occupationKeywords.default;
    const uniqueKeywords = [...new Set(keywords)];
    const selectedKeywords = uniqueKeywords.slice(0, 3);

    // Generate summaries
    const summaries = {
        'entry-level':
            targetLanguage === 'English'
                ? `Enthusiastic ${positionTitle} with ${yearsOfExperience.max} years of experience, specializing in ${selectedKeywords.join(
                      ', '
                  )}. Passionate about delivering high-quality results and continuously developing expertise in ${occupation}.`
                : `Enthousiaste ${positionTitle} avec ${yearsOfExperience.max} années d'expérience, spécialisé en ${selectedKeywords.join(
                      ', '
                  )}. Passionné par la livraison de résultats de haute qualité et le développement continu de l'expertise en ${occupation}.`,

        'mid-level':
            targetLanguage === 'English'
                ? `Results-driven ${positionTitle} with ${yearsOfExperience.max} years of experience delivering successful outcomes through ${selectedKeywords.join(
                      ', '
                  )}. Proven ability to combine technical expertise with strong collaboration skills.`
                : `${positionTitle} axé sur les résultats avec ${yearsOfExperience.max} années d'expérience offrant des résultats réussis grâce à ${selectedKeywords.join(
                      ', '
                  )}. Capacité prouvée à combiner l'expertise technique avec de solides compétences de collaboration.`,

        'senior-level':
            targetLanguage === 'English'
                ? `Accomplished ${positionTitle} with over ${yearsOfExperience.min} years of progressive experience in ${selectedKeywords.join(
                      ', '
                  )}. Demonstrated success in implementing innovative solutions to complex challenges.`
                : `${positionTitle} accompli avec plus de ${yearsOfExperience.min} années d'expérience progressive en ${selectedKeywords.join(
                      ', '
                  )}. Succès démontré dans la mise en œuvre de solutions innovantes aux défis complexes.`,
    };

    // Generate employment history
    const generateEmployments = () => {
        const employments = [];
        let totalYears = yearsOfExperience.max;

        // Company name parts
        const companyPrefixes = ['Global', 'Prime', 'Elite', 'Advanced', 'Innovative', 'Strategic', 'Premier', 'Essential'];
        const companySuffixes = ['Solutions', 'Technologies', 'Systems', 'Industries', 'Enterprises', 'Group', 'International', 'Consulting'];

        // Generate achievements
        const generateAchievements = () => {
            const achievements = [
                `Led key initiatives that improved efficiency by ${Math.floor((occupationSeed * 7) % 30) + 15}%`,
                `Collaborated with cross-functional teams to deliver successful projects on time and within budget`,
                `Implemented innovative solutions to address complex business challenges`,
            ];

            return achievements.join('\n• ');
        };

        // Current job
        const currentEmployer = `${companyPrefixes[occupationSeed % companyPrefixes.length]} ${companySuffixes[(occupationSeed * 3) % companySuffixes.length]}`;
        const currentEmployment = {
            id: 1,
            jobTitle: positionTitle,
            employer: currentEmployer,
            begin: `${currentYear - Math.min(3, totalYears)}`,
            end: 'Present',
            description: `• ${generateAchievements()}`,
            date: Date.now(),
        };
        employments.push(currentEmployment);
        totalYears -= 3;

        // Add previous positions
        for (let i = 0; i < 2; i++) {
            const previousPrefix = companyPrefixes[(occupationSeed * (7 + i * 3)) % companyPrefixes.length];
            const previousSuffix = companySuffixes[(occupationSeed * (11 + i * 5)) % companySuffixes.length];
            const previousEmployer = `${previousPrefix} ${previousSuffix}`;

            let previousJobTitle;
            if (i === 0) {
                previousJobTitle = experienceLevel === 'senior-level' ? occupation : `Junior ${occupation}`;
            } else {
                previousJobTitle = `Junior ${occupation}`;
            }

            const yearsInPosition = Math.min(2, totalYears > 0 ? totalYears : 2);
            const endYear = currentYear - Math.min(3, totalYears) - i * 2;
            const beginYear = endYear - yearsInPosition;

            const previousEmployment = {
                id: i + 2,
                jobTitle: previousJobTitle,
                employer: previousEmployer,
                begin: `${Math.max(beginYear, currentYear - 15)}`, // Avoid unrealistic dates
                end: `${endYear}`,
                description: `• ${generateAchievements()}`,
                date: Date.now() - 1000 * (i + 1),
            };
            employments.push(previousEmployment);
            totalYears -= yearsInPosition;
        }

        return employments;
    };

    // Generate education history
    const generateEducations = () => {
        const universityPrefixes = ['National', 'Central', 'Metropolitan', 'State', 'Pacific', 'Atlantic', 'Northern', 'Southern'];
        const universitySuffixes = ['University', 'College', 'Institute of Technology', 'State University', 'College of Arts & Sciences'];

        // Education-related degree mapping based on occupation
        const degreesByField = {
            software: ['Computer Science', 'Software Engineering', 'Information Technology'],
            market: ['Marketing', 'Business Administration', 'Digital Marketing'],
            sales: ['Business Administration', 'Marketing', 'Communications'],
            manager: ['Business Administration', 'Management', 'Organizational Leadership'],
            design: ['Graphic Design', 'Design', 'Fine Arts'],
            default: ['Business Administration', 'Liberal Arts', 'Communications'],
        };

        const educations = [];

        // Find appropriate degree for the occupation
        let degreeField = 'default';
        for (const field in degreesByField) {
            if (occupation.toLowerCase().includes(field)) {
                degreeField = field;
                break;
            }
        }
        const degrees = degreesByField[degreeField];

        // Use provided education or generate default ones
        if (education.length > 0) {
            education.forEach((edu, index) => {
                const degree = `Bachelor's in ${degrees[(occupationSeed + index) % degrees.length]}`;
                educations.push({
                    id: index + 1,
                    school: edu,
                    degree: degree,
                    started: `${currentYear - yearsOfExperience.max - 4}`,
                    finished: `${currentYear - yearsOfExperience.max}`,
                    description: 'Graduated with honors. Participated in relevant coursework and projects.',
                    date: Date.now() - index * 1000,
                });
            });
        }

        // Generate additional education entries to ensure we have at least 3
        const totalNeeded = Math.max(0, 3 - educations.length);
        for (let i = 0; i < totalNeeded; i++) {
            const index = educations.length;
            const uniPrefix = universityPrefixes[(occupationSeed * (1 + i)) % universityPrefixes.length];
            const uniSuffix = universitySuffixes[(occupationSeed * (3 + i)) % universitySuffixes.length];
            const school = `${uniPrefix} ${uniSuffix}`;

            let degree, started, finished, description;
            if (i === 0 && educations.length === 0) {
                // Main undergraduate education
                degree = `Bachelor's in ${degrees[occupationSeed % degrees.length]}`;
                started = `${currentYear - yearsOfExperience.max - 4}`;
                finished = `${currentYear - yearsOfExperience.max}`;
                description = 'Graduated with honors. Participated in relevant coursework and projects.';
            } else if (i === 1 || (i === 0 && educations.length > 0)) {
                // Master's degree
                degree = `Master's in ${degrees[(occupationSeed * 3) % degrees.length]}`;
                started = `${currentYear - yearsOfExperience.max + 1}`;
                finished = `${currentYear - yearsOfExperience.max + 3}`;
                description = 'Specialized in advanced topics with thesis research. Achieved academic excellence.';
            } else {
                // Earlier education or certification
                degree = `Associate's in ${degrees[(occupationSeed * 5) % degrees.length]}`;
                started = `${currentYear - yearsOfExperience.max - 7 + i}`;
                finished = `${currentYear - yearsOfExperience.max - 5 + i}`;
                description = 'Completed foundational coursework with practical training components.';
            }

            educations.push({
                id: index + 1,
                school: school,
                degree: degree,
                started: started,
                finished: finished,
                description: description,
                date: Date.now() - (index + 1) * 1000,
            });
        }

        return educations;
    };

    // Generate skills
    const generateSkills = () => {
        const skillsList = [];

        // Use provided skills or generate based on occupation
        if (skills.length > 0) {
            skills.forEach((skill, index) => {
                skillsList.push({
                    id: index + 1,
                    name: skill,
                    rating: Math.floor(Math.random() * 2) + 3, // Ratings between 3-5
                    date: Date.now() - index * 1000,
                });
            });
        }

        // Default skills based on occupation
        const defaultSkills = {
            'Software Engineer': ['JavaScript', 'React', 'Node.js', 'Python', 'SQL', 'Git', 'Docker', 'AWS'],
            'Frontend Developer': ['HTML5', 'CSS3', 'JavaScript', 'React', 'Redux', 'Responsive Design', 'Webpack', 'TypeScript'],
            'Backend Developer': ['Node.js', 'Express', 'Python', 'Django', 'SQL', 'MongoDB', 'API Design', 'Docker'],
            'Full Stack Developer': ['JavaScript', 'React', 'Node.js', 'Express', 'SQL', 'Git', 'MongoDB', 'REST APIs'],
            'Data Analyst': ['Excel', 'SQL', 'Tableau', 'Python', 'R', 'Statistical Analysis', 'Data Visualization', 'Power BI'],
            'UX Designer': ['User Research', 'Wireframing', 'Prototyping', 'Figma', 'Adobe XD', 'Usability Testing', 'Information Architecture', 'User Personas'],
            'Product Manager': ['Product Strategy', 'Roadmapping', 'User Stories', 'Agile', 'Market Research', 'Product Analytics', 'Stakeholder Management', 'A/B Testing'],
            'Marketing Manager': ['Digital Marketing', 'Content Strategy', 'SEO', 'Social Media', 'Analytics', 'Campaign Management', 'Market Research', 'Brand Development'],
            default: ['Communication', 'Problem Solving', 'Team Collaboration', 'Project Management', 'Time Management', 'Adaptability', 'Critical Thinking', 'Organization'],
        };

        // Find best match from default skills
        let bestMatch = 'default';
        Object.keys(defaultSkills).forEach((key) => {
            if (occupation.toLowerCase().includes(key.toLowerCase())) {
                bestMatch = key;
            }
        });

        // Ensure we have at least 8 skills total
        const totalSkillsNeeded = Math.max(0, 8 - skillsList.length);
        const matchSkills = defaultSkills[bestMatch].slice(0, totalSkillsNeeded);

        // Add the skills
        matchSkills.forEach((skill, index) => {
            const skillId = skillsList.length + index + 1;
            skillsList.push({
                id: skillId,
                name: skill,
                rating: Math.min(5, Math.floor(((occupationSeed * skillId) % 3) + 3)), // Ratings between 3-5
                date: Date.now() - (skillsList.length + index) * 1000,
            });
        });

        return skillsList;
    };

    // Generate languages
    const generateLanguages = () => {
        const primaryLanguages = ['English', 'Spanish', 'French', 'German', 'Mandarin', 'Japanese', 'Portuguese', 'Italian'];
        const secondaryLanguages = ['Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Mandarin', 'Japanese', 'Arabic'];
        const levels = ['Native', 'Fluent', 'Advanced', 'Intermediate', 'Basic'];

        // Use target language as primary, English as secondary (if target is not English)
        const primaryLanguage = targetLanguage;
        const secondaryLanguage = targetLanguage === 'English' ? secondaryLanguages[(occupationSeed * 3) % secondaryLanguages.length] : 'English';

        return [
            {
                id: 1,
                name: primaryLanguage,
                level: 'Native',
                date: Date.now(),
            },
            {
                id: 2,
                name: secondaryLanguage,
                level:
                    targetLanguage === 'English'
                        ? levels[((occupationSeed * 7) % (levels.length - 1)) + 1] // Any except Native
                        : 'Intermediate', // English as intermediate if target language is not English
                date: Date.now() - 1000,
            },
        ];
    };

    // Return the complete resume data
    return {
        firstname: firstName,
        lastname: lastName,
        email: email,
        phone: phone,
        occupation: positionTitle,
        country: location.country,
        city: location.city,
        address: location.address,
        summary: summaries[experienceLevel],
        employments: generateEmployments(),
        educations: generateEducations(),
        languages: generateLanguages(),
        skills: generateSkills(),
        _source: 'fallback',
    };
};

// Generate skills based on occupation endpoint
router.post('/generate-skills', async (req, res) => {
    try {
        const { occupation, experienceLevel = 'mid-level', language = 'en' } = req.body;

        console.log('===== SKILLS GENERATION REQUEST =====');
        console.log('Received skills generation request:', { occupation, experienceLevel, language });

        if (!occupation) {
            console.log('❌ ERROR: No occupation provided');
            return res.status(400).json({ error: 'Occupation is required' });
        }

        // Language mapping for proper language names in prompt
        const languageNames = {
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            nl: 'Dutch',
            pl: 'Polish',
            se: 'Swedish',
            no: 'Norwegian',
            dk: 'Danish',
            is: 'Icelandic',
            gk: 'Greek',
            ro: 'Romanian',
        };

        const targetLanguage = languageNames[language] || 'English';
        console.log('Target language mapped to:', targetLanguage);

        // Check for API key
        const apiKey = await getGeminiApiKey(req);
        console.log('AI provider key configured:', Boolean(apiKey));

        if (!apiKey) {
            console.log('⚠️  No GEMINI_API_KEY found in environment variables, using fallback skills generator');
            const fallbackSkills = generateFallbackSkills(occupation, experienceLevel, targetLanguage);
            console.log('📋 Returning fallback skills:', fallbackSkills.slice(0, 3).join(', ') + '...');
            return res.json({ skills: fallbackSkills });
        }

        // Initialize the Gemini API
        console.log('🤖 Initializing Gemini AI...');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        // Create a comprehensive prompt for skills generation
        const prompt = `
        You are a professional career advisor. Generate 12 relevant skills for a ${occupation} position at ${experienceLevel} level.
        
        CRITICAL REQUIREMENT: You MUST write everything in ${targetLanguage}. Do NOT use English if the target language is not English.
        ${targetLanguage === 'Spanish' ? 'ESCRIBIR EN ESPAÑOL SOLAMENTE. NO USAR INGLÉS.' : ''}
        ${targetLanguage === 'French' ? "ÉCRIRE EN FRANÇAIS SEULEMENT. NE PAS UTILISER L'ANGLAIS." : ''}
        
        LANGUAGE: ${targetLanguage}
        TARGET LANGUAGE: ${targetLanguage}
        WRITE IN: ${targetLanguage}
        RESPONSE LANGUAGE: ${targetLanguage}
        
        Generate skills that are:
        - Highly relevant to ${occupation} role
        - Appropriate for ${experienceLevel} experience level
        - ABSOLUTELY NO parenthetical examples like "(e.g. Google Ad Manager)" or "(e.g. Excel)" in skill names
        - Concise 1-3 word specific industry skill or tool names only (e.g. "Google Ad Manager", "Display Advertising", "PostgreSQL", "Excel")
        - Mix of technical skills and soft skills
        - Industry-standard and in-demand skills in ${targetLanguage}
        - Current and modern skills for this field
        - EVERY SINGLE WORD must be written in ${targetLanguage}
        
        Include a mix of:
        - Core technical skills for ${occupation}
        - Programming languages/tools (if applicable)
        - Methodologies and frameworks
        - Soft skills relevant to the role
        - Industry-specific knowledge
        
        If the target language is Spanish (${targetLanguage}), use Spanish words and terminology.
        If the target language is French (${targetLanguage}), use French words and terminology.
        
        Format the response as a JSON array of skill names only, like this:
        ["Skill 1", "Skill 2", "Skill 3", ...]
        
        Example format (but write in ${targetLanguage}):
        ["JavaScript", "Problem Solving", "Team Leadership", "Agile Methodology"]
        
        Remember: Write EVERYTHING in ${targetLanguage}. Do not mix languages.
        Only return the JSON array without any explanation or additional text.
        `;

        console.log('📤 Sending prompt to Gemini AI...');
        console.log('Prompt preview:', prompt.substring(0, 200) + '...');

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        console.log('📥 AI response received for language', targetLanguage + ':', text.substring(0, 200) + '...');

        // Parse the JSON response
        let jsonText = text;
        if (text.includes('```json')) {
            jsonText = text.split('```json')[1].split('```')[0].trim();
        } else if (text.includes('```')) {
            jsonText = text.split('```')[1].split('```')[0].trim();
        }

        try {
            const skills = JSON.parse(jsonText);

            if (Array.isArray(skills) && skills.length > 0) {
                console.log('✅ Successfully generated AI skills for language:', targetLanguage);
                console.log('🎯 Generated skills:', skills.slice(0, 5).join(', ') + '...');
                console.log('===== SKILLS GENERATION SUCCESS =====');
                res.json({ skills: skills.slice(0, 12) }); // Limit to 12 skills
            } else {
                console.log('❌ Invalid AI response format, using fallback');
                const fallbackSkills = generateFallbackSkills(occupation, experienceLevel, targetLanguage);
                console.log('📋 Returning fallback skills:', fallbackSkills.slice(0, 3).join(', ') + '...');
                res.json({ skills: fallbackSkills });
            }
        } catch (parseError) {
            console.error('❌ Failed to parse JSON from AI response:', parseError);
            console.log('Raw AI response:', text);
            const fallbackSkills = generateFallbackSkills(occupation, experienceLevel, targetLanguage);
            console.log('📋 Returning fallback skills due to parse error:', fallbackSkills.slice(0, 3).join(', ') + '...');
            res.json({ skills: fallbackSkills });
        }
    } catch (error) {
        console.error('❌ Error generating AI skills:', error);
        // Use fallback method if AI generation fails
        const { occupation, experienceLevel = 'mid-level', language = 'en' } = req.body;
        const languageNames = {
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            nl: 'Dutch',
            pl: 'Polish',
            se: 'Swedish',
            no: 'Norwegian',
            dk: 'Danish',
            is: 'Icelandic',
            gk: 'Greek',
            ro: 'Romanian',
        };
        const targetLanguage = languageNames[language] || 'English';
        const fallbackSkills = generateFallbackSkills(occupation, experienceLevel, targetLanguage);
        console.log('📋 Returning fallback skills due to error:', fallbackSkills.slice(0, 3).join(', ') + '...');
        console.log('===== SKILLS GENERATION FAILED =====');
        res.json({ skills: fallbackSkills });
    }
});

// Fallback function to generate skills when AI is not available
const generateFallbackSkills = (occupation, experienceLevel = 'mid-level', targetLanguage = 'English') => {
    // Skills database organized by occupation and language
    const skillsDatabase = {
        English: {
            'software developer': {
                technical: ['JavaScript', 'Python', 'React', 'Node.js', 'SQL', 'Git', 'Docker', 'AWS', 'TypeScript', 'MongoDB'],
                soft: ['Problem Solving', 'Team Collaboration', 'Code Review', 'Agile Methodology'],
            },
            'frontend developer': {
                technical: ['HTML5', 'CSS3', 'JavaScript', 'React', 'Vue.js', 'Webpack', 'Sass', 'TypeScript', 'Responsive Design', 'Jest'],
                soft: ['User Experience Focus', 'Cross-browser Compatibility', 'Design Collaboration', 'Performance Optimization'],
            },
            'backend developer': {
                technical: ['Node.js', 'Python', 'Express.js', 'PostgreSQL', 'MongoDB', 'REST APIs', 'GraphQL', 'Docker', 'Microservices', 'Redis'],
                soft: ['System Architecture', 'Database Design', 'API Development', 'Security Best Practices'],
            },
            'data analyst': {
                technical: ['Python', 'SQL', 'Tableau', 'Excel', 'Power BI', 'R', 'Pandas', 'NumPy', 'Statistics', 'Data Visualization'],
                soft: ['Critical Thinking', 'Business Intelligence', 'Statistical Analysis', 'Report Writing'],
            },
            'product manager': {
                technical: ['Product Analytics', 'A/B Testing', 'User Research', 'Wireframing', 'JIRA', 'Confluence', 'SQL', 'Data Analysis'],
                soft: ['Strategic Planning', 'Stakeholder Management', 'Cross-functional Leadership', 'Market Research'],
            },
            'marketing manager': {
                technical: ['Google Analytics', 'SEO', 'SEM', 'Social Media Marketing', 'Content Management', 'Email Marketing', 'Adobe Creative Suite', 'HubSpot'],
                soft: ['Brand Management', 'Campaign Strategy', 'Market Analysis', 'Customer Segmentation'],
            },
            designer: {
                technical: ['Figma', 'Adobe Creative Suite', 'Sketch', 'Prototyping', 'User Interface Design', 'Adobe XD', 'InVision', 'Zeppelin'],
                soft: ['Creative Thinking', 'User Experience Design', 'Visual Communication', 'Design Systems'],
            },
            default: {
                technical: ['Microsoft Office', 'Project Management', 'Data Analysis', 'Communication Tools', 'Time Management', 'Digital Literacy'],
                soft: ['Leadership', 'Communication', 'Problem Solving', 'Teamwork', 'Adaptability', 'Critical Thinking'],
            },
        },
        Spanish: {
            'software developer': {
                technical: ['JavaScript', 'Python', 'React', 'Node.js', 'SQL', 'Git', 'Docker', 'AWS', 'TypeScript', 'MongoDB'],
                soft: ['Resolución de Problemas', 'Colaboración en Equipo', 'Revisión de Código', 'Metodología Ágil'],
            },
            'frontend developer': {
                technical: ['HTML5', 'CSS3', 'JavaScript', 'React', 'Vue.js', 'Webpack', 'Sass', 'TypeScript', 'Diseño Responsivo', 'Jest'],
                soft: ['Enfoque en Experiencia de Usuario', 'Compatibilidad Cross-browser', 'Colaboración de Diseño', 'Optimización de Rendimiento'],
            },
            'backend developer': {
                technical: ['Node.js', 'Python', 'Express.js', 'PostgreSQL', 'MongoDB', 'APIs REST', 'GraphQL', 'Docker', 'Microservicios', 'Redis'],
                soft: ['Arquitectura de Sistemas', 'Diseño de Base de Datos', 'Desarrollo de APIs', 'Mejores Prácticas de Seguridad'],
            },
            'data analyst': {
                technical: ['Python', 'SQL', 'Tableau', 'Excel', 'Power BI', 'R', 'Pandas', 'NumPy', 'Estadísticas', 'Visualización de Datos'],
                soft: ['Pensamiento Crítico', 'Inteligencia de Negocios', 'Análisis Estadístico', 'Redacción de Informes'],
            },
            default: {
                technical: ['Microsoft Office', 'Gestión de Proyectos', 'Análisis de Datos', 'Herramientas de Comunicación', 'Gestión del Tiempo', 'Alfabetización Digital'],
                soft: ['Liderazgo', 'Comunicación', 'Resolución de Problemas', 'Trabajo en Equipo', 'Adaptabilidad', 'Pensamiento Crítico'],
            },
        },
        French: {
            'software developer': {
                technical: ['JavaScript', 'Python', 'React', 'Node.js', 'SQL', 'Git', 'Docker', 'AWS', 'TypeScript', 'MongoDB'],
                soft: ['Résolution de Problèmes', "Collaboration d'Équipe", 'Révision de Code', 'Méthodologie Agile'],
            },
            'frontend developer': {
                technical: ['HTML5', 'CSS3', 'JavaScript', 'React', 'Vue.js', 'Webpack', 'Sass', 'TypeScript', 'Design Responsive', 'Jest'],
                soft: ['Focus Expérience Utilisateur', 'Compatibilité Cross-browser', 'Collaboration Design', 'Optimisation Performance'],
            },
            'backend developer': {
                technical: ['Node.js', 'Python', 'Express.js', 'PostgreSQL', 'MongoDB', 'APIs REST', 'GraphQL', 'Docker', 'Microservices', 'Redis'],
                soft: ['Architecture Système', 'Design Base de Données', 'Développement APIs', 'Meilleures Pratiques Sécurité'],
            },
            default: {
                technical: ['Microsoft Office', 'Gestion de Projet', 'Analyse de Données', 'Outils de Communication', 'Gestion du Temps', 'Littératie Numérique'],
                soft: ['Leadership', 'Communication', 'Résolution de Problèmes', "Travail d'Équipe", 'Adaptabilité', 'Pensée Critique'],
            },
        },
    };

    // Get skills for the target language or default to English
    const languageSkills = skillsDatabase[targetLanguage] || skillsDatabase['English'];

    // Find the best matching occupation
    let occupationKey = 'default';
    const occupationLower = occupation.toLowerCase();

    // Check for exact matches first
    if (languageSkills[occupationLower]) {
        occupationKey = occupationLower;
    } else {
        // Check for partial matches
        for (const key in languageSkills) {
            if (occupationLower.includes(key.replace(/ /g, '')) || key.replace(/ /g, '').includes(occupationLower.replace(/ /g, ''))) {
                occupationKey = key;
                break;
            }
        }
    }

    const selectedSkills = languageSkills[occupationKey];

    // Combine technical and soft skills
    const technicalSkills = selectedSkills.technical || [];
    const softSkills = selectedSkills.soft || [];

    // Adjust skill selection based on experience level
    let techCount, softCount;
    switch (experienceLevel) {
        case 'entry-level':
            techCount = Math.min(6, technicalSkills.length);
            softCount = Math.min(6, softSkills.length);
            break;
        case 'senior-level':
            techCount = Math.min(8, technicalSkills.length);
            softCount = Math.min(4, softSkills.length);
            break;
        default: // mid-level
            techCount = Math.min(7, technicalSkills.length);
            softCount = Math.min(5, softSkills.length);
    }

    // Select skills
    const selectedTechSkills = technicalSkills.slice(0, techCount);
    const selectedSoftSkills = softSkills.slice(0, softCount);

    // Combine and return
    return [...selectedTechSkills, ...selectedSoftSkills].slice(0, 12);
};

// Fallback function to check grammar when AI is not available
function generateFallbackGrammarCheck(text, targetLanguage = 'English') {
    // Simple fallback grammar check - looks for common issues
    const corrections = [];
    
    // Basic checks for common grammar issues
    const commonErrors = [
        { pattern: /\bi\b/g, suggestion: 'I', type: 'grammar', explanation: 'Personal pronoun should be capitalized' },
        { pattern: /\b(there|their|they\'re)\b/g, suggestion: 'check usage', type: 'grammar', explanation: 'Check if correct form of there/their/they\'re is used' },
        { pattern: /\b(your|you\'re)\b/g, suggestion: 'check usage', type: 'grammar', explanation: 'Check if correct form of your/you\'re is used' },
        { pattern: /\b(its|it\'s)\b/g, suggestion: 'check usage', type: 'grammar', explanation: 'Check if correct form of its/it\'s is used' },
        { pattern: /\s{2,}/g, suggestion: ' ', type: 'formatting', explanation: 'Multiple spaces should be single space' },
        { pattern: /\s+\./g, suggestion: '.', type: 'punctuation', explanation: 'No space before period' },
        { pattern: /\s+,/g, suggestion: ',', type: 'punctuation', explanation: 'No space before comma' }
    ];
    
    commonErrors.forEach(error => {
        let match;
        while ((match = error.pattern.exec(text)) !== null) {
            if (error.type === 'grammar' && error.pattern.source.includes('(there|their|they\'re)')) {
                // Skip this complex check in fallback
                continue;
            }
            corrections.push({
                original: match[0],
                suggestion: error.suggestion,
                type: error.type,
                explanation: error.explanation,
                startIndex: match.index,
                endIndex: match.index + match[0].length
            });
        }
    });
    
    return {
        hasErrors: corrections.length > 0,
        corrections: corrections.slice(0, 5), // Limit to 5 corrections
        overallSuggestion: corrections.length > 0 ? 
            `Found ${corrections.length} potential issues. Consider reviewing for grammar and formatting.` : 
            `Text appears to be well-written with no obvious grammar errors.`
    };
}

// Grammar checker endpoint
router.post('/check-grammar', async (req, res) => {
    try {
        const { text, language = 'en' } = req.body;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({ error: 'Text is required for grammar checking' });
        }

        console.log('Received grammar check request for language:', language);
        console.log('Text length:', text.length);

        // Language mapping for proper language names in prompt
        const languageNames = {
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            nl: 'Dutch',
            pl: 'Polish',
            se: 'Swedish',
            no: 'Norwegian',
            dk: 'Danish',
            is: 'Icelandic',
            gk: 'Greek',
            ro: 'Romanian',
        };

        const targetLanguage = languageNames[language] || 'English';

        // Check for API key
        const apiKey = await getGeminiApiKey(req);
        if (!apiKey) {
            console.log('No API key found, using fallback grammar checker');
            const fallbackData = generateFallbackGrammarCheck(text, targetLanguage);
            return res.json(fallbackData);
        }

        // Initialize the Gemini API with enhanced configuration for grammar checking
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ 
            model: 'gemini-2.0-flash',
            generationConfig: {
                temperature: 0.1, // Low temperature for more consistent, focused analysis
                topK: 1,          // Use only the most likely tokens for precision
                topP: 0.8,        // Focused token selection
                maxOutputTokens: 8192 // Ensure enough tokens for comprehensive analysis
            }
        });

        // Prepare the comprehensive prompt for Gemini
        const prompt = `
        You are an expert grammar checker and writing assistant with extensive knowledge of ${targetLanguage} language rules. Your task is to perform a COMPREHENSIVE and EXHAUSTIVE analysis of the provided text in a SINGLE PASS to identify ALL errors and issues.
        
        ANALYSIS APPROACH - Follow this systematic process:
        1. **Read the entire text first** to understand context and intent
        2. **Sentence-by-sentence analysis** for grammar and structure
        3. **Word-by-word review** for spelling and usage
        4. **Punctuation and formatting check** throughout
        5. **Style and clarity assessment** for improvements
        6. **Final comprehensive review** to ensure nothing is missed
        
        Text to analyze:
        "${text}"
        
        COMPREHENSIVE ERROR DETECTION - Check for ALL of the following:
        
        **GRAMMAR ERRORS:**
        - Subject-verb agreement issues
        - Incorrect verb tenses and forms
        - Wrong pronoun usage (he/she/it, they/them, possessive pronouns)
        - Article errors (a/an/the)
        - Preposition mistakes
        - Sentence fragments and run-on sentences
        - Incorrect word order
        - Dangling modifiers
        - Parallel structure issues
        - Conditional sentence errors
        
        **SPELLING & WORD USAGE:**
        - Misspelled words
        - Homophone confusions (there/their/they're, your/you're, its/it's)
        - Wrong word choices (affect/effect, accept/except)
        - Repeated words or phrases
        - Missing or extra words
        - Capitalization errors
        
        **PUNCTUATION & FORMATTING:**
        - Missing or incorrect punctuation marks
        - Comma splices and comma errors
        - Apostrophe misuse
        - Quotation mark errors
        - Hyphen and dash usage
        - Spacing issues (extra spaces, missing spaces)
        
        **STYLE & CLARITY:**
        - Awkward phrasing that can be improved
        - Redundant expressions
        - Unclear or ambiguous sentences
        - Word repetition that should be varied
        - Passive voice that should be active (when appropriate)
        
        CRITICAL INSTRUCTIONS:
        - **BE THOROUGH**: This is a ONE-TIME analysis. Find EVERY error, don't leave anything for a second pass
        - **BE ACCURATE**: Calculate exact startIndex and endIndex positions for each error
        - **BE PRECISE**: Only flag actual errors, not stylistic preferences
        - **BE COMPREHENSIVE**: Look at the text from multiple angles (grammar, spelling, style, clarity)
        - **BE SYSTEMATIC**: Go through the text methodically, don't skip sections
        
        RESPONSE FORMAT - Return ONLY this JSON structure:
        {
            "hasErrors": boolean,
            "corrections": [
                {
                    "original": "exact text with error",
                    "suggestion": "corrected version",
                    "type": "grammar|spelling|punctuation|style",
                    "explanation": "clear, brief explanation of the issue",
                    "startIndex": exact_character_position,
                    "endIndex": exact_end_position
                }
            ],
            "overallSuggestion": "comprehensive assessment of text quality and main areas for improvement"
        }
        
        Remember: This is your ONLY chance to catch all errors. Be thorough, methodical, and comprehensive in your analysis.`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text_response = response.text();

        console.log('Raw AI response:', text_response);

        // Clean up the response to extract JSON
        let jsonText = text_response;
        if (text_response.includes('```json')) {
            jsonText = text_response.split('```json')[1].split('```')[0].trim();
        } else if (text_response.includes('```')) {
            jsonText = text_response.split('```')[1].split('```')[0].trim();
        }

        try {
            const grammarResult = JSON.parse(jsonText);
            
            if (grammarResult && typeof grammarResult === 'object') {
                console.log('Successfully generated AI grammar check for language:', targetLanguage);
                console.log('Found errors:', grammarResult.hasErrors);
                console.log('Number of corrections:', grammarResult.corrections?.length || 0);
                
                res.json(grammarResult);
            } else {
                throw new Error('Invalid response format');
            }
        } catch (parseError) {
            console.error('Error parsing AI response:', parseError);
            console.log('Attempting fallback parsing...');
            
            // Try to extract information from non-JSON response
            const fallbackData = generateFallbackGrammarCheck(text, targetLanguage);
            res.json(fallbackData);
        }

    } catch (error) {
        console.error('Error in grammar checking:', error);
        // Use fallback method if AI generation fails
        const { text, language = 'en' } = req.body;
        const languageNames = {
            en: 'English',
            es: 'Spanish',
            fr: 'French',
            de: 'German',
            it: 'Italian',
            pt: 'Portuguese',
            ru: 'Russian',
            nl: 'Dutch',
            pl: 'Polish',
            se: 'Swedish',
            no: 'Norwegian',
            dk: 'Danish',
            is: 'Icelandic',
            gk: 'Greek',
            ro: 'Romanian',
        };
        const targetLanguage = languageNames[language] || 'English';
        const fallbackData = generateFallbackGrammarCheck(text, targetLanguage);
        res.json(fallbackData);
    }
});

const extractJsonObject = (text) => {
    const cleaned = String(text || '').replace(/```json|```/gi, '').trim();
    try { return JSON.parse(cleaned); } catch (_) {}
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
        try { return JSON.parse(cleaned.slice(start, end + 1)); } catch (_) {}
    }
    return null;
};

// Small auxiliary operations retained behind the same auth/quota boundary.
router.post('/generate-content', async (req, res) => {
    const operation = String(req.body.operation || '');
    const payload = req.body.payload || {};
    const key = await getGeminiApiKey(req);
    if (!key) return res.status(503).json({ error: { code: 'AI_PROVIDER_UNAVAILABLE', message: 'AI provider is not configured', requestId: res.locals.requestId } });
    const compact = value => String(value || '').replace(/[\u0000-\u001f]/g, ' ').slice(0, 4000);
    let prompt;
    if (operation === 'enhance-single-bullet') {
        prompt = `Improve this resume bullet without inventing facts. Return JSON only: {"enhancedBullet":"..."}. Bullet: ${compact(payload.bullet)}`;
    } else if (operation === 'generate-certifications') {
        prompt = `Recommend up to 6 real, recognized certifications for this candidate. Do not invent credentials. Return JSON only: {"certifications":[{"title":"...","issuer":"..."}]}. Role: ${compact(payload.jobTitle || payload.occupation)}. Skills: ${compact(payload.skills)}. Education: ${compact(payload.education)}.`;
    } else if (operation === 'autocomplete') {
        const allowedTypes = new Set(['jobTitle', 'occupation', 'employer', 'school', 'degree', 'skill', 'city']);
        const type = allowedTypes.has(payload.type) ? payload.type : 'occupation';
        prompt = `Return up to 8 concise autocomplete values as JSON only: {"suggestions":["..."]}. Field: ${type}. Prefix: ${compact(payload.query).slice(0, 100)}`;
    } else {
        return res.status(400).json({ error: { code: 'UNSUPPORTED_AI_OPERATION', message: 'Unsupported AI operation', requestId: res.locals.requestId } });
    }
    try {
        const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' });
        const result = await model.generateContent(prompt);
        const parsed = extractJsonObject(result.response.text());
        if (!parsed) throw new Error('INVALID_AI_RESPONSE');
        return res.json(parsed);
    } catch (error) {
        console.error('[Aux AI]', error.message);
        return res.status(502).json({ error: { code: 'AI_PROVIDER_ERROR', message: 'AI generation failed', requestId: res.locals.requestId } });
    }
});

router.post('/parse-resume', async (req, res) => {
    const rawText = String(req.body.rawText || '');
    if (!rawText || rawText.length > 40_000) return res.status(400).json({ error: { code: 'INVALID_RESUME_TEXT', message: 'Resume text must be between 1 and 40000 characters', requestId: res.locals.requestId } });
    const key = await getGeminiApiKey(req);
    if (!key) return res.status(503).json({ error: { code: 'AI_PROVIDER_UNAVAILABLE', message: 'AI provider is not configured', requestId: res.locals.requestId } });
    const prompt = `Extract resume facts without inventing data. Return one JSON object only with keys firstname, lastname, email, phone, occupation, city, country, address, postalcode, summary, employments, educations, skills, languages. Missing scalar fields must be empty strings and missing arrays empty arrays. Resume text:\n${rawText}`;
    try {
        const model = new GoogleGenerativeAI(key).getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' });
        const result = await model.generateContent(prompt);
        const parsed = extractJsonObject(result.response.text());
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('INVALID_AI_RESPONSE');
        return res.json({ data: parsed });
    } catch (error) {
        console.error('[Resume parser]', error.message);
        return res.status(502).json({ error: { code: 'AI_PROVIDER_ERROR', message: 'Resume parsing failed', requestId: res.locals.requestId } });
    }
});

// Test endpoint to check AI configuration
router.get('/test-ai-config', async (req, res) => {
    try {
        console.log('===== AI CONFIGURATION TEST =====');
        console.log('Environment check:');
        console.log('- NODE_ENV:', process.env.NODE_ENV);
        const configuredKey = await getGeminiApiKey(req);
        console.log('- GEMINI_API_KEY exists:', Boolean(configuredKey));
        
        if (!configuredKey) {
            return res.status(500).json({
                error: 'GEMINI_API_KEY is not configured',
                configured: false
            });
        }

        // Test the API connection
        const genAI = new GoogleGenerativeAI(configuredKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const result = await model.generateContent('Test connection. Just respond with "API working".');
        const response = await result.response;
        const text = response.text();
        
        console.log('✅ AI API test successful:', text);
        
        res.json({
            configured: true,
            apiWorking: true,
            testResponse: text,
            model: 'gemini-2.0-flash'
        });
    } catch (error) {
        console.error('❌ Error checking AI configuration:', error);
        res.status(500).json({
            error: 'Failed to check AI configuration',
            message: error.message,
        });
    }
});

module.exports = router;
