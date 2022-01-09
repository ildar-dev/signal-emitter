import http from 'http';
import { handler } from './brokers/tws/handler';
import { TMessage } from './types';

import config from './config.json';

const server = http.createServer((request: any, response: any) => {
    let data = '';

    if (request.method === "GET") {
        data = 'GET RESPONSE';
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
server.listen(config.sender.port, config.sender.host);