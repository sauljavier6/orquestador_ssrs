import OAuth from "oauth-1.0a";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

export const accountId = process.env.NS_ACCOUNT_ID as string;

export const baseUrl = `https://${accountId}.suitetalk.api.netsuite.com`;

export const oauth = new OAuth({
  consumer: {
    key: process.env.NS_CONSUMER_KEY as string,
    secret: process.env.NS_CONSUMER_SECRET as string,
  },
  signature_method: "HMAC-SHA256",
  hash_function(base_string, key) {
    return crypto
      .createHmac("sha256", key)
      .update(base_string)
      .digest("base64");
  },
});

export const token = {
  key: process.env.NS_TOKEN_ID as string,
  secret: process.env.NS_TOKEN_SECRET as string,
};
