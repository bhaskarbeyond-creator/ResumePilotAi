export const HOMEPAGE_FAQS = Object.freeze([
  Object.freeze({
    q: 'Can I preview resume layouts before creating an account?',
    a: 'You can browse the public template previews without signing in. Creating an account is required to save and edit a personal resume. Available features can vary with the current platform configuration.',
  }),
  Object.freeze({
    q: 'Can IME365 guarantee that my resume will pass an ATS?',
    a: 'No resume builder can guarantee how a particular employer’s applicant tracking system will parse or rank a document. IME365 provides structured resume layouts and optional tools that help you review content against a job description; employers make their own screening decisions.',
  }),
  Object.freeze({
    q: 'Which formats can I export?',
    a: 'PDF and Microsoft Word export options are available in supported resume workflows. The available actions are shown in the editor, and formatting can differ between document viewers.',
  }),
  Object.freeze({
    q: 'What does the AI Interview Coach do?',
    a: 'When the feature is enabled, the Interview Coach can provide practice prompts and feedback based on information you choose to submit. Its feedback is guidance, not a hiring decision, verified score, or promise of an employment outcome.',
  }),
  Object.freeze({
    q: 'How is my resume information handled?',
    a: 'Account identity is handled through Firebase Authentication and application records are stored in MariaDB. When you use an AI feature, the relevant prompt is sent to the provider configured for the platform. Review the privacy policy before submitting sensitive information.',
  }),
]);
