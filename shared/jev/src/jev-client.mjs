import { TypeSafeClient } from '@typesafe-ai/sdk';

export const createJevGateway = ({ client }) => {
  const askJev = (request, options) => client.systemOne(request, options);

  return { askJev };
};

let defaultGateway;

const getDefaultGateway = () => {
  defaultGateway ??= createJevGateway({ client: new TypeSafeClient() });
  return defaultGateway;
};

export const askJev = (request, options) => getDefaultGateway().askJev(request, options);
