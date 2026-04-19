import { GoogleGenAI, Type } from "@google/genai";
import { Product, Customer } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function getProductRecommendations(customer: Customer, allProducts: Product[]) {
  if (!process.env.GEMINI_API_KEY) {

    return allProducts.slice(0, 3); // Fallback to first 3 products
  }

  const prompt = `
    Given a customer's purchase history and browsing history, recommend 3 products from the available catalog.
    
    Customer: ${customer.name}
    Purchase History (Product IDs): ${customer.purchaseHistory?.join(", ") || "None"}
    Browsing History: ${customer.browsingHistory?.join(", ") || "None"}
    
    Available Catalog:
    ${allProducts.map(p => `- ID: ${p.id}, Name: ${p.name}, Category: ${p.category}, Description: ${p.description}`).join("\n")}
    
    Return the recommendations as a JSON array of product IDs.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });

    const recommendedIds = JSON.parse(response.text || "[]") as string[];
    return allProducts.filter(p => recommendedIds.includes(p.id!));
  } catch (error) {

    return allProducts.slice(0, 3);
  }
}

export async function cleanUnstructuredData(rawData: string) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set.");
  }

  const prompt = `
    Analyze the following raw, unstructured, or messy product data and convert it into a clean, structured JSON array.
    Each object in the array should follow this schema:
    {
      "name": string (required),
      "sku": string (optional),
      "category": string (optional),
      "price": number (required, default 0),
      "cost": number (optional, default 0),
      "stockLevel": number (required, default 0),
      "reorderLevel": number (optional, default 5),
      "description": string (optional),
      "unit": string (optional, e.g., 'pcs', 'kg', 'ltr'),
      "brand": string (optional),
      "specifications": object (optional, key-value pairs of technical details)
    }

    Raw Data:
    ${rawData}

    Return ONLY the JSON array.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              sku: { type: Type.STRING },
              category: { type: Type.STRING },
              price: { type: Type.NUMBER },
              cost: { type: Type.NUMBER },
              stockLevel: { type: Type.NUMBER },
              reorderLevel: { type: Type.NUMBER },
              description: { type: Type.STRING },
              unit: { type: Type.STRING },
              brand: { type: Type.STRING },
              specifications: { type: Type.OBJECT, properties: {}, additionalProperties: { type: Type.STRING } }
            },
            required: ["name", "price", "stockLevel"]
          }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {

    throw error;
  }
}

export async function getAutomatedTaxSuggestion(items: any[], businessInfo: any, customerInfo: any) {
  if (!process.env.GEMINI_API_KEY) return null;

  const prompt = `
    Act as an AI Tax Consultant. Based on the following transaction details, suggest the most appropriate tax rate and category.
    
    Business: ${JSON.stringify(businessInfo)}
    Customer: ${JSON.stringify(customerInfo)}
    Items: ${JSON.stringify(items)}
    
    Output ONLY a JSON object with:
    {
      "suggestedRate": number,
      "taxName": string (e.g., 'GST', 'VAT', 'Sales Tax'),
      "reasoning": string
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {

    return null;
  }
}
