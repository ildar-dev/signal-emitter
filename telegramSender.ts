import config from './config.json';

const request = require('request');

export default (message: string) => {
  const options = {
    uri: `http://${config.log.server.host}:${config.log.server.port}`,
    method: 'POST',
    json: {
      message,
    },
  };

  request(options, (error: any) => {
    if (error) {
      console.error('TG_WARNINGS', error);
    }
  });
}