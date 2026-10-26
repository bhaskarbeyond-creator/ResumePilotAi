'use strict';

/**
 * Settings fields that match a credential-shaped pattern but are **public by
 * design**, because the browser must embed them.
 *
 * ## Rule for adding an entry
 *
 * An entry is only permissible when ALL of the following hold:
 *
 *  1. the value is delivered to every anonymous visitor by design (a client SDK
 *     identifier, not a server credential);
 *  2. the value grants no server-side authority on its own — it is scoped by a
 *     secret that stays server-side, or by an origin allowlist at the provider;
 *  3. the field name ends in `ApiKey`/`Key` and the provider documents it as
 *     publishable.
 *
 * `test/setting-classification.test.js` asserts this list stays minimal and that
 * every entry is genuinely publishable-named, so it cannot quietly become a
 * dumping ground for "the build broke after we classified this".
 *
 * @module security/settingClassification.data
 */

/**
 * Field names that are public client identifiers.
 * @type {ReadonlySet<string>}
 */
const PUBLIC_CLIENT_KEYS = new Set([
  // Google Maps JavaScript API key: embedded in the page; restricted by HTTP
  // referrer at Google, and useless without the separately-held server key.
  'googleMapsApiKey',
  // Cloudinary unsigned upload preset / cloud name pair used by the asset
  // picker; the API secret remains server-side.
  'cloudinaryApiKey',
  // Razorpay `key_id` and Stripe publishable key are the documented public half
  // of a two-part credential pair.
  'razorpayKeyId',
  'stripePublishableKey',
  'publishableKey',
  'recaptchaSiteKey',
  'siteKey',
]);

module.exports = { PUBLIC_CLIENT_KEYS };
