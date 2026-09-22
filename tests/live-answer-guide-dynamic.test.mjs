import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const dom = new JSDOM('<!doctype html><html><body><div id="test-root"></div></body></html>', { url: 'https://app.example.test/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');

const stubPlugin = {
    name: 'live-guide-stubs',
    load(id) {
        if (/\/src\/services\/liveInterviewApi(\.js)?(\?.*)?$/.test(id)) {
            return `
              export const getLiveAnswerGuide = async (input) => {
                  if (input && input.regenerate) {
                      return {
                          goal: 'Regenerated strategic goal evaluating architectural alternatives for ' + input.question,
                          modelAnswer: 'Alternative 10/10 STAR: In my role as a ' + (input.role || 'Engineer') + ', I designed an event-driven queue with idempotent consumers, reducing p99 latency by 58% and eliminating message loss.',
                          tip: 'Focus on why you picked this alternative architecture over synchronous RPC.'
                      };
                  }
                  return {
                      goal: 'Evaluating dynamic technical competency for ' + input.question,
                      modelAnswer: 'In my role as a ' + (input.role || 'Engineer') + ', I led this initiative with structured execution, resolving constraints and improving delivery metrics.',
                      tip: 'Be specific about personal ownership and measurable impact.'
                  };
              };
            `;
        }
        return null;
    },
};

const vite = await createServer({
    configFile: false,
    root: process.cwd(),
    plugins: [react(), stubPlugin],
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
    optimizeDeps: { noDiscovery: true },
});

const LiveAnswerGuide = (await vite.ssrLoadModule('/src/components/Dashboard/DashboardInterviews/LiveAnswerGuide.jsx')).default;

test('LiveAnswerGuide renders strictly the 3 items: Goal, Full 10/10 Answer, and Tip for frontend question', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const reactRoot = createRoot(container);
    let insertedSnippet = '';

    await act(async () => {
        reactRoot.render(
            React.createElement(LiveAnswerGuide, {
                question: 'Can you walk me through a frontend delivery decision you owned and how you evaluated its outcome?',
                topic: 'Frontend delivery judgment',
                intent: 'Evaluating client-side architecture and performance',
                role: 'Senior React Developer',
                modelAnswer: 'In my frontend work as a Senior React Developer, I owned the delivery of our client interface, introduced route-level code splitting, and dropped First Contentful Paint by 42%.',
                tip: 'Avoid merely listing libraries—explain the specific architectural decision.',
                onInsertSnippet: (snippet) => { insertedSnippet = snippet; }
            })
        );
    });

    const textContent = container.textContent || '';
    
    // Assert ZERO placeholder brackets
    assert.doesNotMatch(textContent, /\[(Feature|Option|Project|Role|Metric|X)/, 'Must not contain generic placeholder brackets like [Option A]');
    
    // Assert exactly the 3 core items
    assert.match(textContent, /Interviewer's Goal/i, 'Item 1: Must present Interviewer Goal');
    assert.match(textContent, /Candidate 10\/10 Answer/i, 'Item 2: Must present Candidate 10/10 Answer');
    assert.match(textContent, /Tip:/i, 'Item 3: Must present Tip');

    // Assert full answer quality
    assert.match(textContent, /First Contentful Paint/i, 'Answer must cite real frontend performance metrics');
    assert.match(textContent, /Senior React Developer/i, 'Answer must cite the candidate role');

    // Test insert answer button
    const insertButtons = container.querySelectorAll('button[title*="Click to insert"]');
    assert.ok(insertButtons.length >= 1, 'Expected 1-click insert answer button');
    
    await act(async () => {
        insertButtons[0].dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    
    assert.ok(insertedSnippet.length > 50, 'Clicking insert must supply full 10/10 answer');
    assert.match(insertedSnippet, /First Contentful Paint/, 'Inserted text contains full 10/10 answer');
    assert.doesNotMatch(insertedSnippet, /\[/, 'Inserted answer must not contain brackets');

    await act(async () => {
        reactRoot.unmount();
    });
    container.remove();
});

test('LiveAnswerGuide adapts dynamically to database and zero-downtime migration question', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const reactRoot = createRoot(container);

    await act(async () => {
        reactRoot.render(
            React.createElement(LiveAnswerGuide, {
                question: 'How do you handle a zero-downtime database schema migration on high throughput tables?',
                topic: 'Database architecture',
                role: 'Backend Platform Engineer',
                modelAnswer: 'We executed a zero-downtime schema migration across high-throughput tables using the expand-and-contract pattern with zero table lock contention.',
                tip: 'Never alter high-traffic tables in a single synchronous DDL statement.',
            })
        );
    });

    const textContent = container.textContent || '';
    assert.doesNotMatch(textContent, /\[/, 'Must not contain brackets');
    assert.match(textContent, /Interviewer's Goal/i);
    assert.match(textContent, /Candidate 10\/10 Answer/i);
    assert.match(textContent, /Tip:/i);
    assert.match(textContent, /expand-and-contract/i, 'Must formulate expand-and-contract spoken answer');
    assert.match(textContent, /table lock contention/i, 'Must quote database outcome');

    await act(async () => {
        reactRoot.unmount();
    });
    container.remove();
});

test('LiveAnswerGuide adapts dynamically to production incident and outage question', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const reactRoot = createRoot(container);

    await act(async () => {
        reactRoot.render(
            React.createElement(LiveAnswerGuide, {
                question: 'Describe a challenging production outage you had to debug and resolve under time pressure.',
                topic: 'Incident management',
                role: 'Site Reliability Engineer',
                modelAnswer: 'During a production outage, I immediately contained the blast radius by rolling back, then led a blameless postmortem.',
                tip: 'Take extreme personal ownership of the mitigation.',
            })
        );
    });

    const textContent = container.textContent || '';
    assert.doesNotMatch(textContent, /\[/, 'Must not contain brackets');
    assert.match(textContent, /Interviewer's Goal/i);
    assert.match(textContent, /blast radius/i, 'Must formulate blast radius containment');
    assert.match(textContent, /postmortem/i, 'Must emphasize systemic prevention');
    assert.match(textContent, /Tip:/i);

    await act(async () => {
        reactRoot.unmount();
    });
    container.remove();
});

test('LiveAnswerGuide dynamically deconstructs question when modelAnswer is fetched asynchronously', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const reactRoot = createRoot(container);

    await act(async () => {
        reactRoot.render(
            React.createElement(LiveAnswerGuide, {
                question: 'How did you migrate your Kubernetes clusters across cloud providers without downtime?',
                topic: 'Cloud infrastructure',
                role: 'DevOps Architect',
            })
        );
    });

    // Wait for microtask tick for async guide resolution
    await act(async () => {
        await new Promise(r => setTimeout(r, 20));
    });

    const textContent = container.textContent || '';
    assert.doesNotMatch(textContent, /\[/, 'Must not contain brackets');
    assert.match(textContent, /Interviewer's Goal/i);
    assert.match(textContent, /Candidate 10\/10 Answer/i);
    assert.match(textContent, /DevOps Architect/i, 'Must adapt to role');
    assert.match(textContent, /Tip:/i);

    await act(async () => {
        reactRoot.unmount();
    });
    container.remove();
});

test('LiveAnswerGuide seamlessly prioritizes custom AI-supplied talking points when provided', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const reactRoot = createRoot(container);

    const customPoints = [
        'I spearheaded the migration of our monolith to Go microservices handling 40k req/sec.',
        'We implemented gRPC with protobuf serialization to drop internal payload sizes by 70%.',
        'This reduced inter-service latency from 45ms to 6ms and saved $18,000 in monthly compute.'
    ];

    await act(async () => {
        reactRoot.render(
            React.createElement(LiveAnswerGuide, {
                question: 'Walk me through your Go microservices migration.',
                topic: 'Microservices architecture',
                role: 'Principal Backend Engineer',
                talkingPoints: customPoints,
            })
        );
    });

    const textContent = container.textContent || '';
    assert.match(textContent, /40k req\/sec/, 'Must display custom AI opening point');
    assert.match(textContent, /protobuf serialization/, 'Must display custom AI action point');
    assert.match(textContent, /\$18,000 in monthly compute/, 'Must display custom AI result point');

    await act(async () => {
        reactRoot.unmount();
    });
    container.remove();
});

test('LiveAnswerGuide adapts dynamically to introduction and career overview question', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const reactRoot = createRoot(container);

    await act(async () => {
        reactRoot.render(
            React.createElement(LiveAnswerGuide, {
                question: 'Welcome to this interview. Could you start by introducing yourself and giving an overview of your frontend development background?',
                topic: 'Introduction & background',
                role: 'Frontend Developer',
                modelAnswer: 'Over the past several years as a Frontend Developer, my primary focus has been engineering high-performance web applications with modern component frameworks.',
                tip: 'Keep your spoken introduction under 90 seconds.',
            })
        );
    });

    const textContent = container.textContent || '';
    assert.doesNotMatch(textContent, /\[/, 'Must not contain brackets');
    assert.match(textContent, /Interviewer's Goal/i, 'Must present goal for intro');
    assert.match(textContent, /Candidate 10\/10 Answer/i, 'Must present 10/10 answer for intro');
    assert.match(textContent, /Frontend Developer/i, 'Must include career pitch');
    assert.match(textContent, /Tip:/i, 'Must present intro tip');

    await act(async () => {
        reactRoot.unmount();
    });
    container.remove();
});

test('LiveAnswerGuide provides 1-click Regenerate button to fetch alternative 10/10 STAR answer dynamically', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const reactRoot = createRoot(container);
    let insertedSnippet = '';

    await act(async () => {
        reactRoot.render(
            React.createElement(LiveAnswerGuide, {
                question: 'How do you design a fault-tolerant distributed cache?',
                topic: 'Distributed Systems',
                role: 'Staff Infrastructure Engineer',
                modelAnswer: 'Initial Answer: We deployed a Redis cluster with sentinel failover and client-side consistent hashing.',
                tip: 'Mention cache stampede mitigation.',
                onInsertSnippet: (snippet) => { insertedSnippet = snippet; }
            })
        );
    });

    const initialText = container.textContent || '';
    assert.match(initialText, /Redis cluster with sentinel/i, 'Initial answer should be displayed');
    assert.match(initialText, /10\/10 STAR Response/i, 'Must display 10/10 STAR label');

    const regenButton = container.querySelector('button[title*="Regenerate"]');
    assert.ok(regenButton, 'Regenerate button must be present in DOM');
    assert.match(regenButton.textContent || '', /Regenerate/i, 'Button text must say Regenerate');

    // Click Regenerate
    await act(async () => {
        regenButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    // Wait for async resolution
    await act(async () => {
        await new Promise(r => setTimeout(r, 20));
    });

    const updatedText = container.textContent || '';
    assert.match(updatedText, /Alternative 10\/10 STAR/i, 'Answer must update to the regenerated 10/10 STAR response');
    assert.match(updatedText, /reducing p99 latency by 58%/i, 'Regenerated answer includes specific STAR metrics');
    assert.match(updatedText, /Regenerated strategic goal/i, 'Goal must update with fresh perspective');

    // Test inserting the newly regenerated answer
    const insertButton = container.querySelector('button[title*="Click to insert"]');
    assert.ok(insertButton, 'Insert button must still be accessible');

    await act(async () => {
        insertButton.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    assert.match(insertedSnippet, /Alternative 10\/10 STAR/i, 'Inserted answer must be the newly regenerated 10/10 STAR answer');

    await act(async () => {
        reactRoot.unmount();
    });
    container.remove();
});

test('LiveAnswerGuide rejects schema leakage placeholders like "Opening situation sentence answering question..." and fetches dynamic STAR answer', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const reactRoot = createRoot(container);

    await act(async () => {
        reactRoot.render(
            React.createElement(LiveAnswerGuide, {
                question: 'How do you design a high-throughput stream processing pipeline?',
                topic: 'Data Engineering',
                role: 'Data Platform Engineer',
                modelAnswer: 'Opening situation sentence answering question Specific technical decision or trade-off Quantified metric or outcome',
                talkingPoints: [
                    'Opening situation sentence answering question',
                    'Specific technical decision or trade-off',
                    'Quantified metric or outcome'
                ],
            })
        );
    });

    // Wait for microtask tick for async guide resolution
    await act(async () => {
        await new Promise(r => setTimeout(r, 20));
    });

    const textContent = container.textContent || '';
    assert.doesNotMatch(textContent, /Opening situation sentence answering question/i, 'Must NEVER display schema placeholder text in candidate answer');
    assert.doesNotMatch(textContent, /Specific technical decision or trade-off/i, 'Must NEVER display schema placeholder text');
    assert.doesNotMatch(textContent, /Quantified metric or outcome/i, 'Must NEVER display schema placeholder text');
    assert.match(textContent, /Candidate 10\/10 Answer/i);
    assert.match(textContent, /Data Platform Engineer/i, 'Must generate real dynamic STAR answer tailored to role and question');

    await act(async () => {
        reactRoot.unmount();
    });
    container.remove();
});

test.after(async () => {
    await vite.close();
});
