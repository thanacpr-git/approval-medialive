const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || 'ap-southeast-1_XXXXXXXXX',
      userPoolClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || 'xxxxxxxxxxxxxxxxxxxxxxxxxx',
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_COGNITO_DOMAIN || 'your-domain.auth.ap-southeast-1.amazoncognito.com',
          scopes: ['openid', 'email', 'profile'],
          redirectSignIn: [import.meta.env.VITE_REDIRECT_SIGN_IN || 'http://localhost:3000/'],
          redirectSignOut: [import.meta.env.VITE_REDIRECT_SIGN_OUT || 'http://localhost:3000/'],
          responseType: 'code',
        },
      },
    },
  },
  API: {
    REST: {
      MatchAPI: {
        endpoint: import.meta.env.VITE_API_ENDPOINT || 'http://localhost:4000/api',
        region: 'ap-southeast-1',
      },
    },
  },
};

export default awsConfig;
