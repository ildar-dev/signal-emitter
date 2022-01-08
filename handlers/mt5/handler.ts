// @ts-nocheck
import MetaApi from 'metaapi.cloud-sdk';

// Note: for information on how to use this example code please read https://metaapi.cloud/docs/client/usingCodeExamples
// It is recommended to create accounts with automatic broker settings detection instead,
// see metaApiSynchronizationExample.js

let token = process.env.TOKEN || 'eyJhbGciOiJSUzUxMiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI0Zjg4OWMyYjI1MDUzNmVjNTQ0MTBlMDEzNzMwNmViNCIsInBlcm1pc3Npb25zIjpbXSwidG9rZW5JZCI6IjIwMjEwMjEzIiwiaWF0IjoxNjQxNjQ0OTY4LCJyZWFsVXNlcklkIjoiNGY4ODljMmIyNTA1MzZlYzU0NDEwZTAxMzczMDZlYjQifQ.dMQUii-iIwvg7h7hywN373EtJQt3fPf731Ixe9N7U0gF3WOuG5mvKqRYENi9_C8gWznd41aXv14d3ZyLjtIDrGKkHryMREeG66514Zd4VmZJQSTyHWof5glZ39-MyxsIzhIUxAosXhVwmoyt6x2sVOtWs1p0l3-8LO8dnU3Lhp58xFh-gUnLIHwRk1Vvs5JA3Fo8VbS6F285aQRQLTfKSLmYYVUCTgLAQsk6k-rtmYLId3i3Iwxr2zrGJxSBLjcRYQwiWgbHahfh8Jrw1pWbbQInbF0QxysTh8lWKmmWZZTClytdYwtOVZfRuikm7jUezMIVQJFbTVcVd-EQgLCYZQXkdeSoy90rxdyGjiM9jl9m78J2NvLdU6Vg8ibP7YvpPmZQALACsezFKuDdNJMn1CE8VJafzd1Vc64b4R3z7L3kqin3SL8Q2KkD8HwsUHoE-sxDyduU6kzHXYocO14h1eR4DtqrHlBuOGMPHoKA3Bkr7nQygqxFOsC_19n31Hdc3yfqK-aGdSxTo8DibgNv4cQfO9XBcDsW5Zpuw_lvIlsNeoAEMPFvwDDW-psmi7bYeibQFiI3vFzYKuVzmW1-e3EHTGqJ_ee9Tu3djzvM8pgS4htzJuHbyUGEch563Wu1RenhkovM6_ANewHsEpQzqsZ-4ANV2tQdH0qZX9ThVTU';
let login = process.env.LOGIN || '67033143';
let password = process.env.PASSWORD || 'C9a92134D';
let serverName = process.env.SERVER || 'RoboForex-ECN';
let serverDatFile = process.env.PATH_TO_SERVERS_DAT || './servers.dat';

const api = new MetaApi(token);

async function testMetaApiSynchronization() {
  try {
    const profiles = await api.provisioningProfileApi.getProvisioningProfiles();

    // create test MetaTrader account profile
    let profile = profiles.find(p => p.name === serverName);
    if (!profile) {
      console.log('Creating account profile');
      profile = await api.provisioningProfileApi.createProvisioningProfile({
        name: serverName,
        version: 5,
        brokerTimezone: 'EET',
        brokerDSTSwitchTimezone: 'EET'
      });
      await profile.uploadFile('servers.dat', serverDatFile);
    }
    if (profile && profile.status === 'new') {
      console.log('Uploading servers.dat');
      await profile.uploadFile('servers.dat', serverDatFile);
    } else {
      console.log('Account profile already created');
    }

    // Add test MetaTrader account
    let accounts = await api.metatraderAccountApi.getAccounts();
    let account = accounts.find(a => a.login === login && a.type.startsWith('cloud'));
    if (!account) {
      console.log('Adding MT5 account to MetaApi');
      account = await api.metatraderAccountApi.createAccount({
        name: 'Test account',
        type: 'cloud',
        login: login,
        password: password,
        server: serverName,
        provisioningProfileId: profile.id,
        application: 'MetaApi',
        magic: 1000
      });
    } else {
      console.log('MT5 account already added to MetaApi');
    }

    // wait until account is deployed and connected to broker
    console.log('Deploying account');
    await account.deploy();
    console.log('Waiting for API server to connect to broker (may take couple of minutes)');
    await account.waitConnected();

    // connect to MetaApi API
    let connection = account.getStreamingConnection();
    await connection.connect();

    // wait until terminal state synchronized to the local state
    console.log('Waiting for SDK to synchronize to terminal state (may take some time depending on your history size)');
    await connection.waitSynchronized();

    // access local copy of terminal state
    console.log('Testing terminal state access');
    let terminalState = connection.terminalState;
    console.log('connected:', terminalState.connected);
    console.log('connected to broker:', terminalState.connectedToBroker);
    console.log('account information:', terminalState.accountInformation);
    console.log('positions:', terminalState.positions);
    console.log('orders:', terminalState.orders);
    console.log('specifications:', terminalState.specifications);
    console.log('EURUSD specification:', terminalState.specification('EURUSD'));
    await connection.subscribeToMarketData('EURUSD');
    console.log('EURUSD price:', terminalState.price('EURUSD'));

    // access history storage
    const historyStorage = connection.historyStorage;
    console.log('deals:', historyStorage.deals.slice(-5));
    console.log('history orders:', historyStorage.historyOrders.slice(-5));

    // trade
    console.log('Submitting pending order');
    try {
      let result = await
      connection.createLimitBuyOrder('GBPUSD', 0.07, 1.0, 0.9, 2.0, {
        comment: 'comm',
        clientId: 'TE_GBPUSD_7hyINWqAlE'
      });
      console.log('Trade successful, result code is ' + result.stringCode);
    } catch (err) {
      console.log('Trade failed with result code ' + err.stringCode);
    }

    // finally, undeploy account after the test
    console.log('Undeploying MT5 account so that it does not consume any unwanted resources');
    await account.undeploy();
  } catch (err) {
    console.error(err);
  }
  process.exit();
}

testMetaApiSynchronization();