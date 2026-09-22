import { TypeSafeClient } from '@typesafe-ai/sdk';

export const createJevGateway = ({ client }) => {
  const askJev = (request) => client.systemOne(request);

  return { askJev };
};

let defaultGateway;

const getDefaultGateway = () => {
  defaultGateway ??= createJevGateway({ client: new TypeSafeClient() });
  return defaultGateway;
};

export const askJev = (request) => getDefaultGateway().askJev(request);
