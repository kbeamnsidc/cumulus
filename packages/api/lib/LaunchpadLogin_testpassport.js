'use strict';

const fs = require('fs');
const { URL } = require('url');
const passport = require('passport');
const SamlStrategy = require('passport-saml').Strategy;
const { OAuth2 } = require('./OAuth2');

class LaunchpadLogin extends OAuth2 {
  static createFromEnv({ redirectUri }) {
    return new LaunchpadLogin({
      clientId: process.env.EARTHDATA_CLIENT_ID,
      clientPassword: process.env.EARTHDATA_CLIENT_PASSWORD,
      earthdataLoginUrl: process.env.EARTHDATA_BASE_URL || 'https://uat.urs.earthdata.nasa.gov/',
      redirectUri
    });
  }

  constructor(params) {
    super();

    const {
      clientId,
      clientPassword,
      earthdataLoginUrl,
      redirectUri
    } = params;

    if (!clientId) throw new TypeError('clientId is required');
    this.clientId = clientId;

    if (!clientPassword) throw new TypeError('clientPassword is required');
    this.clientPassword = clientPassword;

    if (!earthdataLoginUrl) throw new TypeError('earthdataLoginUrl is required');
    this.earthdataLoginUrl = new URL(earthdataLoginUrl);

    if (!redirectUri) throw new TypeError('redirectUri is required');
    this.redirectUri = new URL(redirectUri);
  }

  /**
   * Get a URL of the Google OAuth2 authorization endpoint
   *
   * @param {string} [state] - an optional state to pass to Google
   * @returns {string} the Google OAuth2 authorization URL
   */
  getAuthorizationUrl(state) {
    return this.googleOAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: 'https://www.googleapis.com/auth/userinfo.email',
      state: state
    });
  }


  // buildStrategy() {
    // CALLBACK_URL=https://evals-test.rit.edu/login/callback
    // ENTRY_POINT=https://shibboleth-test.main.ad.rit.edu/idp/profile/SAML2/Redirect/SSO
    // ISSUER=https://evals-test.rit.edu/shibboleth
    // SESSION_SECRET=secret

    // path: process.env.SAML_PATH || '/login/callback',
    //     entryPoint: process.env.SAML_ENTRY_POINT || 'https://openidp.feide.no/simplesaml/saml2/idp/SSOService.php',
    //     issuer: 'passport-saml',
    //     cert: process.env.SAML_CERT || null
  //   const samlStrategy = new SamlStrategy({
  //     // URL that goes from the Identity Provider -> Service Provider
  //     callbackUrl: process.env.CALLBACK_URL,
  //     // URL that goes from the Service Provider -> Identity Provider
  //     entryPoint: process.env.ENTRY_POINT,
  //     // Usually specified as `/shibboleth` from site root
  //     issuer: process.env.ISSUER,
  //     identifierFormat: null,
  //     // Service Provider private key
  //     decryptionPvk: fs.readFileSync(__dirname + '/cert/key.pem', 'utf8'),
  //     // Service Provider Certificate
  //     privateCert: fs.readFileSync(__dirname + '/cert/key.pem', 'utf8'),
  //     // Identity Provider's public key
  //     cert: fs.readFileSync(__dirname + '/cert/idp_cert.pem', 'utf8'),
  //     validateInResponseTo: false,
  //     disableRequestedAuthnContext: true
  //   }, (profile, done) => done(null, profile));
  //   return samlStrategy;
  // }


  authentication() {
    passport.use(new SamlStrategy(
      {
        path: process.env.SAML_PATH || '/login/callback',
        entryPoint: process.env.SAML_ENTRY_POINT || 'https://openidp.feide.no/simplesaml/saml2/idp/SSOService.php',
        issuer: 'passport-saml',
        cert: process.env.SAML_CERT || null
      },
      (profile, done) => done(null,
        {
          id: profile.uid,
          email: profile.email,
          displayName: profile.cn,
          firstName: profile.givenName,
          lastName: profile.sn
        })
    ));
    passport.initialize();
    passport.authenticate('saml', { failureRedirect: '/login/fail' });
  }

  /**
   * Given an authorization code, request an access token and associated
   * information from the Google OAuth2 service.
   *
   * Returns an object with the following properties:
   *
   * - accessToken
   * - refreshToken
   * - username
   * - expirationTime (in milliseconds)
   *
   * @param {string} authorizationCode - an OAuth2 authorization code
   * @returns {Promise<Object>} access token information
   */
  async getAccessToken(authorizationCode) {
    if (!authorizationCode) throw new TypeError('authorizationCode is required');

    const { tokens } = await this.googleOAuth2Client.getToken(authorizationCode);

    this.googleOAuth2Client.setCredentials(tokens);

    const userDataResponse = await this.googlePlusPeopleClient.get({
      userId: 'me',
      auth: this.googleOAuth2Client
    });

    return {
      accessToken: tokens.access_token,
      expirationTime: tokens.expiry_date,
      refreshToken: tokens.refresh_token,
      username: userDataResponse.data.emails[0].value
    };
  }

  async refreshAccessToken() {
    throw new Error('Not implemented');
  }
}
module.exports = LaunchpadLogin;
