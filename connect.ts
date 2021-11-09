import http from 'http';
import { handler } from './handler';
import { TMessage } from './types';

const server = http.createServer((request: any, response: any) => {
    let data = '';

    if (request.method === "GET") {
        data = 'get hello';
    } else if (request.method === "POST") {
        let data = '';

        request.on('data', (chunk: any) => {
            data += chunk;
        });

        request.on('end', async () => {
            console.log(data);
            
            let dataJson;
            try {
              dataJson = JSON.parse(data);
            } catch(e) {
              console.error(e);
              return;
            }
            try {
              await handler(dataJson as TMessage);
            } catch(e) {
              console.error('HANDLER ERROR');
              console.error(e);
            }
        })
    }

    response.end(data);
});

console.log('START LISTEN');
server.listen(1222, '172.17.0.1');