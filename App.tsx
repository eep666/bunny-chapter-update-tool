import React, { useState, useCallback } from 'react';
import { GoogleGenAI } from "@google/genai";
import Spinner from './components/Spinner';

// This component is kept locally as it's simple and only used here.
const CodeBlock = ({ content, language }: { content: string, language: string }) => (
    <pre className="bg-gray-900 rounded-lg p-4 text-sm whitespace-pre-wrap break-all">
        <code className={`language-${language}`}>
            {content}
        </code>
    </pre>
);

// Helper function for AI generation, to be reused.
const generateJsonFromNotes = async (notes: string): Promise<string> => {
    if (!process.env.API_KEY) {
        throw new Error("Cannot generate JSON. The Gemini API Key is not configured for this application.");
    }
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const prompt = `
You are an API assistant that converts human-readable video chapter notes into a specific JSON format.
The user will provide notes in various formats. Your task is to parse them and generate a JSON object with a "chapters" key.
Each chapter object in the array must have a "title", a "start" time in total seconds, and an optional "end" time in total seconds.
If an "end" time is not provided for a chapter, you should calculate it from the start time of the next chapter. The last chapter does not need an "end" time.

- Convert all timestamps (like 1:45 or 5m 30s) into total seconds.
- Extract the title.
- The final output MUST be only the raw JSON object, with no extra text, explanations, or markdown formatting like \`\`\`json.

Example Input:
0:00 - Introduction
1:45 Topic A deep dive
5m 30s - Conclusion

Example Output:
{
  "chapters": [
    {
      "title": "Introduction",
      "start": 0,
      "end": 105
    },
    {
      "title": "Topic A deep dive",
      "start": 105,
      "end": 330
    },
    {
      "title": "Conclusion",
      "start": 330
    }
  ]
}

Now, process the following user input:
${notes}
`;
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    let generatedText = response.text.trim();
    if (generatedText.startsWith('```json')) {
        generatedText = generatedText.substring(7, generatedText.length - 3).trim();
    }
    // Basic validation to ensure we got something that looks like JSON
    if (!generatedText.startsWith('{') || !generatedText.endsWith('}')) {
        throw new Error("AI generation failed to produce valid JSON. Please check your notes or try again.");
    }
    return generatedText;
};


const App = () => {
    const [apiKey, setApiKey] = useState('');
    const [apiUrl, setApiUrl] = useState('https://video.bunnycdn.com/library/{libraryId}/videos/{videoId}');
    const [bodyContent, setBodyContent] = useState('');
    
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [apiResponse, setApiResponse] = useState<any>(null);
    const [errorMessage, setErrorMessage] = useState('');

    // Check if the Gemini API key is available in the environment
    const geminiApiKeyAvailable = !!process.env.API_KEY;

    const handleGenerateJson = useCallback(async () => {
        if (!bodyContent) {
            setErrorMessage("The text area is empty. Please add chapter notes.");
            return;
        }
        setIsGenerating(true);
        setErrorMessage('');
        setApiResponse(null);

        try {
           const jsonText = await generateJsonFromNotes(bodyContent);
           setBodyContent(jsonText);
        } catch (error) {
            const msg = error instanceof Error ? error.message : "An unknown error occurred during JSON generation.";
            setErrorMessage(msg);
        } finally {
            setIsGenerating(false);
        }
    }, [bodyContent]);

    const handleSendRequest = useCallback(async () => {
        setApiResponse(null);

        if (!apiKey || !apiUrl || !bodyContent) {
            setErrorMessage('API Key, Request URL, and a Request Body are required.');
            return;
        }

        setIsSending(true);
        setErrorMessage('');
        
        let bodyForRequest = bodyContent;
        let needsGeneration = false;
        try {
            JSON.parse(bodyContent);
        } catch (e) {
            needsGeneration = true;
        }
        
        try {
            if (needsGeneration) {
                if (!geminiApiKeyAvailable) {
                    throw new Error("The content is not valid JSON, and the AI feature is disabled because no Gemini API key is configured for this app.");
                }
                setErrorMessage("Input is not JSON. Auto-generating with AI before sending...");
                const generatedJson = await generateJsonFromNotes(bodyContent);
                setBodyContent(generatedJson); // Update the UI to show what's being sent
                bodyForRequest = generatedJson;
                setErrorMessage(''); // Clear intermediate message
            }

            const parsedBody = JSON.parse(bodyForRequest);

            const res = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'AccessKey': apiKey,
                },
                body: JSON.stringify(parsedBody),
            });

            const responseText = await res.text();
            
            if (res.ok) {
                const responseData = responseText ? JSON.parse(responseText) : { status: res.status, statusText: res.statusText };
                setApiResponse({ success: true, status: res.status, data: responseData });
            } else {
                const errorData = responseText ? JSON.parse(responseText) : { message: res.statusText };
                setApiResponse({ success: false, status: res.status, data: errorData });
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : "An unknown network error occurred.";
            // Show the error in the response block for consistency
            setApiResponse({ success: false, status: 'Application Error', data: { message: msg } });
            setErrorMessage(''); // Clear any intermediate messages
        } finally {
            setIsSending(false);
        }

    }, [apiKey, apiUrl, bodyContent, geminiApiKeyAvailable]);
    
    const isSendDisabled = !apiKey || !apiUrl.startsWith('https') || !bodyContent || isSending;

    return (
        <div className="min-h-screen flex items-start justify-center p-4 sm:p-6 lg:p-8">
            <div className="w-full max-w-4xl mx-auto space-y-6">
                <div className="text-center">
                    <h1 className="text-3xl font-bold text-white">Bunny.net Chapter Update Tool</h1>
                </div>
                
                <div className="bg-gray-800 shadow-2xl rounded-xl p-6 space-y-5">
                     <div>
                        <label htmlFor="apiKey" className="block mb-2 text-sm font-medium text-gray-400">Bunny.net API Key</label>
                        <input id="apiKey" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Your AccessKey" className="bg-gray-700 border border-gray-600 text-gray-200 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 placeholder-gray-500" />
                    </div>

                     {/* URL Bar */}
                     <div className="flex items-center gap-2 bg-gray-900 p-2 rounded-lg">
                        <span className="font-semibold text-yellow-400 px-3 py-1 rounded-md bg-gray-700 text-sm">POST</span>
                        <input 
                            type="text" 
                            value={apiUrl} 
                            onChange={(e) => setApiUrl(e.target.value)} 
                            placeholder="Enter request URL"
                            className="bg-transparent text-gray-300 w-full text-sm focus:outline-none"
                        />
                        <button
                            onClick={handleSendRequest}
                            disabled={isSendDisabled}
                            className="inline-flex items-center justify-center gap-2 text-white bg-blue-600 hover:bg-blue-700 focus:ring-4 focus:outline-none focus:ring-blue-800 font-medium rounded-lg text-sm px-5 py-2 text-center disabled:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 flex-shrink-0"
                        >
                            {isSending ? <Spinner /> : null}
                            <span>{isSending ? 'Sending...' : 'Send'}</span>
                        </button>
                     </div>
                </div>

                {/* Request Body / Notes Area */}
                <div className="bg-gray-800 shadow-2xl rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-2">Request Body / Notes</h3>
                    <textarea
                        id="bodyContent"
                        rows={12}
                        value={bodyContent}
                        onChange={(e) => setBodyContent(e.target.value)}
                        className="bg-gray-900 border border-gray-600 text-gray-200 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 placeholder-gray-500 font-mono"
                        placeholder={`Paste chapter notes here (e.g., "0:00 Intro") and click "Send",\nor paste final JSON directly.`}
                    ></textarea>
                     <div className="mt-4">
                        <button
                            onClick={handleGenerateJson}
                            disabled={isGenerating || !bodyContent || !geminiApiKeyAvailable}
                            title={!geminiApiKeyAvailable ? "AI features are disabled. No Gemini API Key is configured in the environment." : "Generate JSON from notes"}
                            className="inline-flex items-center justify-center gap-2 text-white bg-purple-600 hover:bg-purple-700 focus:ring-4 focus:outline-none focus:ring-purple-800 font-medium rounded-lg text-sm px-5 py-2.5 text-center disabled:bg-purple-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                        >
                            {isGenerating ? <Spinner /> : '✨'}
                            <span>{isGenerating ? 'Generating...' : 'Generate JSON with AI'}</span>
                        </button>
                    </div>
                </div>

                {/* Response Area */}
                <div className="bg-gray-800 shadow-2xl rounded-xl p-6 min-h-[150px]">
                   <h3 className="text-lg font-semibold text-white mb-3">Response</h3>
                   {errorMessage && (
                      <div className="p-4 text-sm rounded-lg bg-blue-900 text-blue-300" role="status">
                         <span className="font-medium">Info:</span> {errorMessage}
                      </div>
                   )}
                   {apiResponse ? (
                      <div className="space-y-3">
                         <div className="flex items-center gap-4">
                            <span className="font-medium">Status:</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${apiResponse.success ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
                              {apiResponse.status}
                            </span>
                         </div>
                         <CodeBlock content={JSON.stringify(apiResponse.data, null, 2)} language="json" />
                      </div>
                   ) : (!errorMessage && <p className="text-gray-500 text-sm">Click 'Send' to get a response.</p>)
                   }
                </div>
                 <div className="mt-6 p-4 bg-yellow-900 border-l-4 border-yellow-500 text-yellow-300 text-sm rounded-r-lg">
                    <h4 className="font-bold">Security & Usage Note</h4>
                    <p>This is an internal tool. Your Bunny.net API key is used directly in the browser. The AI feature requires a Gemini API key to be set as a secure environment variable where this app is hosted. Do not share this tool publicly.</p>
                </div>
            </div>
        </div>
    );
};

export default App;