import { createServer } from 'vite';

async function main() {
    const server = await createServer({
        server: { port: 51793 },
    });
    await server.listen();
    console.log('Vite server running at:', server.resolvedUrls.local[0]);
    
    const res = await fetch('http://localhost:51793/template-lab/builder-preview.html?step=heading');
    console.log('Fetch status:', res.status);
    const text = await res.text();
    console.log('Contains root:', text.includes('id="root"'));
    
    await server.close();
    console.log('Done test');
}

main().catch(console.error);
