import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Validates if the given image buffer represents a "live" photo of the environment
 * instead of a photo of a screen (mobile, laptop, monitor, TV, etc.).
 * @param {Buffer} imageBuffer 
 * @param {string} mimeType 
 * @returns {Promise<{ isLive: boolean, reason: string }>}
 */
export const verifyLiveImage = async (imageBuffer, mimeType = 'image/jpeg') => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `You are a fraud-detection AI for an image upload system. 
Your task is to determine whether this image is a genuine "live" photograph of a physical scene OR if it is a photo taken of another screen (like a laptop monitor, mobile phone screen, TV, or a printed photo). 
Look for clues of a photographed screen such as: moiré patterns, screen glare, visible pixels, screen bezels, UI elements of a photo viewer, or unnatural cropping.
Respond strictly in JSON format: {"isLive": boolean, "reason": "Short explanation"}.
"isLive" should be true ONLY if it is a real physical scene taken directly from the camera, and false if it's a photo of a screen or print.`;

    const imageParts = [
      {
        inlineData: {
          data: imageBuffer.toString('base64'),
          mimeType
        }
      }
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const responseText = result.response.text();
    
    // Parse JSON
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Gemini returned non-JSON:', responseText);
      return { isLive: true, reason: 'Failed to parse AI response' }; // Default to true if AI fails format to not block user
    }

    const { isLive, reason } = JSON.parse(jsonMatch[0]);
    return { isLive, reason };
  } catch (error) {
    console.error('Gemini API Error:', error);
    // If rate limited or error, we might log and allow it, or block. 
    // We'll allow it so the app doesn't break if API fails, but usually we'd fail it.
    return { isLive: true, reason: 'AI Verification unavailable' };
  }
};

/**
 * Compares two images to verify they are of the same location.
 * @param {Buffer} imageBuffer1 - The original problem image
 * @param {string} mime1 
 * @param {Buffer} imageBuffer2 - The resolved worker image
 * @param {string} mime2 
 * @returns {Promise<number|null>} percentage 0-100, or null if error
 */
export const compareImages = async (imageBuffer1, mime1, imageBuffer2, mime2) => {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

    const prompt = `You are an AI tasked with comparing two images representing a before-and-after state of a physical municipal problem (e.g., pothole, garbage, street light). 
Look at both images and determine the similarity percentage based on the background, location context, structures, and objects present, to verify if the 'after' image actually depicts the exact same place as the 'before' image. 
Respond strictly with ONLY an integer number between 0 and 100, representing the confidence percentage of it being the same location. Do not include a percent sign or any other text.`;

    const imageParts = [
      {
        inlineData: {
          data: imageBuffer1.toString('base64'),
          mimeType: mime1
        }
      },
      {
        inlineData: {
          data: imageBuffer2.toString('base64'),
          mimeType: mime2
        }
      }
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const responseText = result.response.text().trim();
    
    // Extract integer
    const score = parseInt(responseText.replace(/[^0-9]/g, ''), 10);
    
    if (isNaN(score)) {
      console.error('Gemini similarity parse failed, got:', responseText);
      return 0;
    }
    
    return Math.min(Math.max(score, 0), 100);
  } catch (error) {
    console.error('Gemini Compare Error:', error);
    return null; 
  }
};
