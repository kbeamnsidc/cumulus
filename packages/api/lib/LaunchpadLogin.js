'use strict';

const fs = require('fs');
const { URL } = require('url');
const saml2 = require('saml2-js');
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

  authentication() {
    const spOptions = {
      entity_id: 'https://sp.example.com/metadata.xml',
      private_key: null,
      certificate: null, // from s3
      assert_endpoint: 'https://sp.example.com/assert',
      force_authn: true,
      auth_context: { comparison: 'exact', class_refs: ['urn:oasis:names:tc:SAML:1.0:am:password'] },
      nameid_format: 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
      sign_get_request: false,
      allow_unencrypted_assertion: true
    };

    const sp = new saml2.ServiceProvider(spOptions);

    const idOptions = {
      sso_login_url: 'https://openidp.feide.no/simplesaml/saml2/idp/SSOService.php',
      sso_logout_url: 'https://idp.example.com/logout',
      certificates: null,
      force_authn: true,
      sign_get_request: false,
      allow_unencrypted_assertion: false
    };

    // Call identity provider constructor with options
    const idp = new saml2.IdentityProvider(idOptions);

    // Example usage of identity provider.
    // Pass identity provider into a service provider function with options and a callback.
    sp.post_assert(idp, {}, (err, samlResponse) => {
      if (err != null) {
        console.log('error');
      } else {
        // get UserId, create token
        console.log(samlResponse);
      }

      // Save name_id and session_index for logout
      // Note:  In practice these should be saved in the user session, not globally.
      //const name_id = samlResponse.user.name_id;
      //const session_index = samlResponse.user.session_index;

      //res.send('Hello #{saml_response.user.name_id}!');
    });
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
