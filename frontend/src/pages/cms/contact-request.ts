export interface ContactInput {
  name: string;
  email: string;
  subject: string;
  message: string;
}

// The endpoint persists name, email and message, but has no subject column.
// Include the subject in the persisted message, within the server's limit.
export async function submitContact(input: ContactInput, send: typeof fetch = fetch): Promise<void> {
  const name = input.name.trim();
  const email = input.email.trim();
  const subject = input.subject.trim();
  const message = input.message.trim();
  const body = `Subject: ${subject}\n\n${message}`;
  if (name.length < 2 || name.length > 100 || !subject || !message || body.length > 5000) {
    throw new Error('Enter a name, subject and message within the allowed lengths.');
  }
  let response: Response;
  try {
    response = await send('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, message: body }),
    });
  } catch {
    throw new Error('The request could not be confirmed. Check your connection before retrying; it may have been received.');
  }
  let data: unknown;
  try { data = await response.json(); } catch { data = null; }
  if (response.status !== 202 || !data || typeof data !== 'object' || !('success' in data) || data.success !== true) {
    if (response.status === 400) throw new Error('Please check your name, email and message and try again.');
    throw new Error('Your request could not be confirmed. Please try again later.');
  }
}
