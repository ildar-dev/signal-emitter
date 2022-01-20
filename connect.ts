import http from 'http';
import { handler } from './brokers/index';
import { TMessage } from './types';
import { errorSerializer, serializer } from './logger';

import config from './config.json';

const server = http.createServer((request, response) => {
    let data = '';

    if (request.method === "GET") {
        data = 'GET RESPONSE';
    } else if (request.method === "POST") {
        let data = '';

        request.on('data', (chunk: string) => {
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
            } catch(error) {
              console.error('ERROR handler', serializer(errorSerializer(error)));
            }
        })
    }

    response.end(data);
});

console.log('🚀 Start listen server');
server.listen(config.sender.port, config.sender.host);