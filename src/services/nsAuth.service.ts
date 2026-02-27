import axios from "axios";
import { oauth, token, baseUrl } from "../config/netsuite.config";

export interface Invoice {
  id: string;
  tranid: string;
  entity: string;
  duedate: string;
  amountremaining: number;
}

export class NetSuiteService {
  //servicio para sacar cliente
  static async getCustomerByEntityId(entityId: string): Promise<any | null> {
    const url = `${baseUrl}/services/rest/query/v1/suiteql`;

    const query = `
      SELECT id, entityid, companyname
      FROM customer
      WHERE entityid = '${entityId}'
    `;

    const requestData = { url, method: "POST" };
    const authData = oauth.authorize(requestData, token);
    const oauthHeaders = oauth.toHeader(authData);

    const headers = {
      ...oauthHeaders,
      Authorization: `OAuth realm="${process.env.NS_REALM}", ${oauthHeaders.Authorization.replace(
        "OAuth ",
        "",
      )}`,
      "Content-Type": "application/json",
      Prefer: "transient",
    };

    try {
      const response = await axios.post(url, { q: query }, { headers });

      const items = response.data.items;
      if (items && items.length > 0) {
        return items[0];
      }

      return null;
    } catch (error: any) {
      console.error("NETSUITE ERROR STATUS:", error.response?.status);
      console.error("NETSUITE ERROR DATA:", error.response?.data);
      throw new Error("Error consultando cliente en NetSuite");
    }
  }

  //servicios para poblar location
  static async getdata(query: string): Promise<any[]> {
    const result = await this.executeQuery<any>(query);
    return result;
  }

  private static async executeQuery<T>(query: string): Promise<T[]> {
    const url = `${baseUrl}/services/rest/query/v1/suiteql`;

    const requestData = { url, method: "POST" };
    const authData = oauth.authorize(requestData, token);
    const oauthHeaders = oauth.toHeader(authData);

    const headers = {
      ...oauthHeaders,
      Authorization: `OAuth realm="${process.env.NS_REALM}", ${oauthHeaders.Authorization.replace(
        "OAuth ",
        "",
      )}`,
      "Content-Type": "application/json",
      Prefer: "transient",
    };

    try {
      const response = await axios.post(url, { q: query }, { headers });
      return response.data.items ?? [];
    } catch (error: any) {
      console.error("NETSUITE URL:", error.config?.url);
      console.error("NETSUITE STATUS:", error.response?.status);
      console.error("NETSUITE DATA:", error.response?.data);
      throw new Error("Error ejecutando SuiteQL en NetSuite");
    }
  }

  static async executeSavedSearch<T>(
    searchId: string | number,
    page: number,
  ): Promise<{ items: T[]; hasMore: boolean }> {
    const restletBaseUrl = baseUrl.replace(
      ".suitetalk.api.netsuite.com",
      ".restlets.api.netsuite.com",
    );

    const url =
      `${restletBaseUrl}/app/site/hosting/restlet.nl` +
      `?script=4690` +
      `&deploy=1` +
      `&searchId=${encodeURIComponent(String(searchId))}` +
      `&page=${page}`;

    const requestData = {
      url,
      method: "GET",
    };

    const authData = oauth.authorize(requestData, token);
    const oauthHeaders = oauth.toHeader(authData);

    const headers = {
      ...oauthHeaders,
      Authorization: `OAuth realm="${process.env.NS_REALM}", ${oauthHeaders.Authorization.replace(
        "OAuth ",
        "",
      )}`,
      "Content-Type": "application/json",
    };

    try {
      const response = await axios.get(url, { headers });
      return response.data;
    } catch (error: any) {
      console.error("NETSUITE URL:", error.config?.url);
      console.error("NETSUITE STATUS:", error.response?.status);
      console.error("NETSUITE DATA:", error.response?.data);
      throw new Error("Error ejecutando Saved Search en NetSuite");
    }
  }
}
