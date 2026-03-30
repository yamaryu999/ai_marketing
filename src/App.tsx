/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Loader2, 
  FileText, 
  AlertCircle,
  BarChart2,
  Building,
  CheckCircle2,
  XCircle,
  Sunrise,
  Search,
  RefreshCw,
  Newspaper,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

type SentimentType = 'Bullish' | 'Bearish' | 'Neutral' | string;

interface AnalysisResult {
  sentiment: SentimentType;
  summary: string;
  positivePoints: string[];
  negativePoints: string[];
}

interface NewsItem {
  headline: string;
  summary: string;
  impact: SentimentType;
  source: string;
}

interface BriefingResult {
  overallSentiment: SentimentType;
  marketSummary: string;
  newsItems: NewsItem[];
}

// Helper to safely parse JSON from AI response (handles markdown code blocks)
const parseJSONResponse = (text: string) => {
  try {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      const jsonStr = text.substring(start, end + 1);
      return JSON.parse(jsonStr);
    }
    const cleanedText = text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedText);
  } catch (e) {
    console.error("JSON Parse Error:", e, text);
    throw new Error("AIからのデータの解析に失敗しました。");
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState<'briefing' | 'analyzer'>('briefing');

  // Briefing State
  const [briefing, setBriefing] = useState<BriefingResult | null>(null);
  const [isFetchingBriefing, setIsFetchingBriefing] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const hasFetchedBriefing = useRef(false);

  // Analyzer State
  const [ticker, setTicker] = useState('');
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzerResult, setAnalyzerResult] = useState<AnalysisResult | null>(null);
  const [analyzerError, setAnalyzerError] = useState<string | null>(null);

  const fetchBriefing = useCallback(async () => {
    setIsFetchingBriefing(true);
    setBriefingError(null);
    setBriefing(null); // Clear previous data to show loading state

    try {
      const prompt = `
本日の最新の重要な経済・株式ニュース（日本市場および米国市場）をGoogle検索で調査し、投資家向けの朝刊ブリーフィングを作成してください。
トップニュースを3〜5つピックアップし、それぞれの市場への影響（Bullish/Bearish/Neutral）を評価してください。

以下のJSONフォーマットで出力してください。Markdownのコードブロック（\`\`\`json ... \`\`\`）で囲んでください。
{
  "overallSentiment": "Bullish, Bearish, または Neutral のいずれか",
  "marketSummary": "今日の市場全体の動向と注目のポイント（2〜3文）",
  "newsItems": [
    {
      "headline": "ニュースの見出し",
      "summary": "ニュースの要約",
      "impact": "Bullish, Bearish, または Neutral のいずれか",
      "source": "情報源（例: 日経新聞, Bloombergなど）"
    }
  ]
}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      if (response.text) {
        setBriefing(parseJSONResponse(response.text) as BriefingResult);
      } else {
        throw new Error('AIからの応答が空でした。');
      }
    } catch (err) {
      console.error('Briefing error:', err);
      setBriefingError('ニュースの取得に失敗しました。時間をおいて再試行してください。');
    } finally {
      setIsFetchingBriefing(false);
    }
  }, []);

  // Auto-fetch briefing on first load
  useEffect(() => {
    if (activeTab === 'briefing' && !briefing && !isFetchingBriefing && !hasFetchedBriefing.current) {
      hasFetchedBriefing.current = true;
      fetchBriefing();
    }
  }, [activeTab, briefing, isFetchingBriefing, fetchBriefing]);

  const handleAnalyze = async () => {
    if (!inputText.trim()) {
      setAnalyzerError('ニュースや決算短信のテキストを入力してください。');
      return;
    }

    setIsAnalyzing(true);
    setAnalyzerError(null);
    setAnalyzerResult(null);

    try {
      const prompt = `
以下の企業に関するニュースまたは決算短信のテキストを分析し、投資家向けに要約してください。
企業名/ティッカー: ${ticker || '指定なし'}

【テキスト】
${inputText}

以下のJSONフォーマットで出力してください。
- sentiment: 全体的なセンチメント（"Bullish" = 強気/買い材料, "Bearish" = 弱気/売り材料, "Neutral" = 中立）
- summary: 2〜3文での簡潔な全体要約
- positivePoints: ポジティブな要素（強気材料）の箇条書きリスト（最大5つ）
- negativePoints: ネガティブな要素（弱気材料・リスク）の箇条書きリスト（最大5つ）
`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              sentiment: { type: Type.STRING },
              summary: { type: Type.STRING },
              positivePoints: { type: Type.ARRAY, items: { type: Type.STRING } },
              negativePoints: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['sentiment', 'summary', 'positivePoints', 'negativePoints'],
          },
        },
      });

      if (response.text) {
        setAnalyzerResult(parseJSONResponse(response.text) as AnalysisResult);
      } else {
        throw new Error('AIからの応答が空でした。');
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setAnalyzerError('分析中にエラーが発生しました。テキストを短くするか、しばらく経ってから再度お試しください。');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getSentimentColor = (sentiment: SentimentType) => {
    switch (sentiment) {
      case 'Bullish': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20 shadow-[0_0_15px_rgba(52,211,153,0.05)]';
      case 'Bearish': return 'text-rose-400 bg-rose-400/10 border-rose-400/20 shadow-[0_0_15px_rgba(251,113,133,0.05)]';
      default: return 'text-slate-300 bg-white/5 border-white/10';
    }
  };

  const getSentimentIcon = (sentiment: SentimentType) => {
    switch (sentiment) {
      case 'Bullish': return <TrendingUp className="w-5 h-5 text-emerald-400" />;
      case 'Bearish': return <TrendingDown className="w-5 h-5 text-rose-400" />;
      default: return <Minus className="w-5 h-5 text-slate-400" />;
    }
  };

  const todayDate = new Date().toLocaleDateString('ja-JP', { 
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit', 
    weekday: 'short' 
  });

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-sans selection:bg-blue-500/30 relative overflow-hidden pb-12">
      
      {/* Atmospheric Background Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] opacity-20 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/30 to-transparent blur-3xl rounded-full mix-blend-screen" />
      </div>
      <div className="absolute bottom-0 right-0 w-[600px] h-[600px] opacity-10 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-tl from-emerald-600/20 to-transparent blur-3xl rounded-full mix-blend-screen" />
      </div>

      {/* Header */}
      <header className="bg-[#050505]/60 backdrop-blur-xl border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-blue-500 to-blue-700 p-2 rounded-xl shadow-[0_0_15px_rgba(59,130,246,0.5)]">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
              AI 投資アシスタント
            </h1>
          </div>
          <div className="font-mono text-xs text-slate-500 tracking-wider">
            SYSTEM.ONLINE
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        
        {/* Tabs - Pill Style */}
        <div className="flex space-x-2 bg-white/5 p-1.5 rounded-full border border-white/5 w-fit backdrop-blur-sm mb-8">
          <button
            onClick={() => setActiveTab('briefing')}
            className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              activeTab === 'briefing' 
                ? 'bg-white/10 text-white shadow-lg border border-white/10' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Sunrise className="w-4 h-4" />
            毎朝のニュース調査
          </button>
          <button
            onClick={() => setActiveTab('analyzer')}
            className={`flex items-center gap-2 px-5 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
              activeTab === 'analyzer' 
                ? 'bg-white/10 text-white shadow-lg border border-white/10' 
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-transparent'
            }`}
          >
            <Search className="w-4 h-4" />
            個別銘柄・決算分析
          </button>
        </div>

        {/* Tab Content: Morning Briefing */}
        {activeTab === 'briefing' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-white flex items-center gap-3">
                  <Newspaper className="w-6 h-6 text-blue-400" />
                  モーニング・ブリーフィング
                </h2>
                <p className="text-slate-400 mt-1.5 font-mono text-sm tracking-wide">
                  DATE: {todayDate} | MARKET OVERVIEW
                </p>
              </div>
              <button
                onClick={fetchBriefing}
                disabled={isFetchingBriefing}
                className="flex items-center gap-2 bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 font-medium py-2 px-4 rounded-lg transition-all disabled:opacity-50 backdrop-blur-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isFetchingBriefing ? 'animate-spin text-blue-400' : ''}`} />
                最新データを同期
              </button>
            </div>

            {briefingError && (
              <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3 text-rose-400 backdrop-blur-sm">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <p>{briefingError}</p>
              </div>
            )}

            {isFetchingBriefing && !briefing ? (
              <div className="flex flex-col items-center justify-center py-24 bg-white/[0.02] rounded-2xl border border-white/5 backdrop-blur-sm">
                <div className="relative">
                  <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 rounded-full animate-pulse" />
                  <Loader2 className="w-12 h-12 text-blue-400 animate-spin mb-6 relative z-10" />
                </div>
                <p className="text-slate-400 font-mono text-sm animate-pulse tracking-widest">
                  FETCHING MARKET DATA...
                </p>
              </div>
            ) : briefing ? (
              <div className="space-y-6">
                {/* Overall Market Summary */}
                <div className="bg-white/[0.02] rounded-2xl border border-white/10 overflow-hidden backdrop-blur-sm relative group">
                  <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-blue-500 to-transparent opacity-50" />
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-mono tracking-widest text-slate-400 uppercase">Market Summary</h3>
                      <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border font-medium text-sm ${getSentimentColor(briefing.overallSentiment)}`}>
                        {getSentimentIcon(briefing.overallSentiment)}
                        {briefing.overallSentiment}
                      </div>
                    </div>
                    <p className="text-slate-200 leading-relaxed text-lg font-light">
                      {briefing.marketSummary}
                    </p>
                  </div>
                </div>

                {/* News Grid */}
                <h3 className="text-sm font-mono tracking-widest text-slate-400 uppercase mt-10 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Top Headlines
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {briefing.newsItems.map((news, index) => (
                    <div key={index} className="bg-white/[0.02] rounded-2xl border border-white/10 p-6 flex flex-col h-full hover:bg-white/[0.04] transition-colors group relative overflow-hidden backdrop-blur-sm">
                      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <h4 className="font-semibold text-slate-100 leading-snug flex-1">
                          {news.headline}
                        </h4>
                        <div className={`flex items-center justify-center p-2 rounded-xl border flex-shrink-0 ${getSentimentColor(news.impact)}`}>
                          {getSentimentIcon(news.impact)}
                        </div>
                      </div>
                      <p className="text-slate-400 text-sm leading-relaxed mb-6 flex-1 font-light">
                        {news.summary}
                      </p>
                      <div className="flex items-center justify-between mt-auto pt-4 border-t border-white/5">
                        <span className="text-xs font-mono text-slate-500 bg-black/50 px-3 py-1.5 rounded-md border border-white/5">
                          {news.source}
                        </span>
                        <span className={`text-xs font-mono tracking-wider ${
                          news.impact === 'Bullish' ? 'text-emerald-400' : 
                          news.impact === 'Bearish' ? 'text-rose-400' : 'text-slate-400'
                        }`}>
                          IMPACT: {news.impact.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </motion.div>
        )}

        {/* Tab Content: Analyzer */}
        {activeTab === 'analyzer' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8"
          >
            {/* Input Section */}
            <div className="lg:col-span-5 space-y-6">
              <div className="bg-white/[0.02] rounded-2xl border border-white/10 p-6 backdrop-blur-sm">
                <h2 className="text-sm font-mono tracking-widest text-slate-400 uppercase mb-6 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Data Input
                </h2>
                
                <div className="space-y-5">
                  <div>
                    <label htmlFor="ticker" className="block text-xs font-mono text-slate-500 mb-2 uppercase tracking-wider">
                      Ticker / Company
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Building className="h-4 w-4 text-slate-500" />
                      </div>
                      <input
                        type="text"
                        id="ticker"
                        value={ticker}
                        onChange={(e) => setTicker(e.target.value)}
                        className="block w-full pl-10 pr-3 py-2.5 bg-black/50 border border-white/10 rounded-xl focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors text-white placeholder-slate-600"
                        placeholder="e.g. AAPL, トヨタ"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="content" className="block text-xs font-mono text-slate-500 mb-2 uppercase tracking-wider">
                      Raw Text Data
                    </label>
                    <textarea
                      id="content"
                      rows={10}
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      className="block w-full p-3 bg-black/50 border border-white/10 rounded-xl focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors resize-none text-white placeholder-slate-600 font-light"
                      placeholder="Paste news article or earnings report here..."
                    />
                  </div>

                  {analyzerError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2 text-rose-400 text-sm">
                      <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <p>{analyzerError}</p>
                    </div>
                  )}

                  <button
                    onClick={handleAnalyze}
                    disabled={isAnalyzing || !inputText.trim()}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-medium py-3 px-4 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(37,99,235,0.2)] hover:shadow-[0_0_25px_rgba(37,99,235,0.4)]"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        ANALYZING...
                      </>
                    ) : (
                      <>
                        <BarChart2 className="w-5 h-5" />
                        RUN ANALYSIS
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Results Section */}
            <div className="lg:col-span-7">
              <AnimatePresence mode="wait">
                {!analyzerResult && !isAnalyzing ? (
                  <motion.div
                    key="empty"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="h-full flex flex-col items-center justify-center text-center p-12 border border-dashed border-white/10 rounded-2xl bg-white/[0.01] min-h-[400px]"
                  >
                    <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10">
                      <BarChart2 className="w-8 h-8 text-slate-500" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-300 mb-2">Awaiting Data Input</h3>
                    <p className="text-slate-500 max-w-sm font-light">
                      Enter text in the left panel and run analysis to extract insights.
                    </p>
                  </motion.div>
                ) : isAnalyzing ? (
                  <motion.div
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full flex flex-col items-center justify-center p-12 min-h-[400px] bg-white/[0.02] rounded-2xl border border-white/5"
                  >
                    <div className="relative">
                      <div className="absolute inset-0 bg-blue-500 blur-xl opacity-20 rounded-full animate-pulse" />
                      <Loader2 className="w-12 h-12 text-blue-400 animate-spin mb-6 relative z-10" />
                    </div>
                    <p className="text-slate-400 font-mono text-sm animate-pulse tracking-widest">
                      PROCESSING TEXT DATA...
                    </p>
                  </motion.div>
                ) : analyzerResult ? (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* Sentiment & Summary Card */}
                    <div className="bg-white/[0.02] rounded-2xl border border-white/10 overflow-hidden backdrop-blur-sm relative">
                      <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-slate-500 to-transparent opacity-30" />
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                          <h2 className="text-sm font-mono tracking-widest text-slate-400 uppercase">Analysis Summary</h2>
                          <div className={`flex items-center gap-2 px-4 py-1.5 rounded-full border font-medium text-sm ${getSentimentColor(analyzerResult.sentiment)}`}>
                            {getSentimentIcon(analyzerResult.sentiment)}
                            {analyzerResult.sentiment}
                          </div>
                        </div>
                        <p className="text-slate-200 leading-relaxed font-light">
                          {analyzerResult.summary}
                        </p>
                      </div>
                    </div>

                    {/* Bull & Bear Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Positive Points */}
                      <div className="bg-white/[0.02] rounded-2xl border border-emerald-500/20 overflow-hidden backdrop-blur-sm relative">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/50 to-transparent" />
                        <div className="bg-emerald-500/5 px-5 py-4 border-b border-emerald-500/10 flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-emerald-400" />
                          <h3 className="font-mono text-sm tracking-widest text-emerald-400 uppercase">Bullish Factors</h3>
                        </div>
                        <div className="p-5">
                          {analyzerResult.positivePoints.length > 0 ? (
                            <ul className="space-y-4">
                              {analyzerResult.positivePoints.map((point, index) => (
                                <li key={index} className="flex items-start gap-3">
                                  <CheckCircle2 className="w-5 h-5 text-emerald-500/70 flex-shrink-0 mt-0.5" />
                                  <span className="text-slate-300 text-sm leading-relaxed font-light">{point}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-slate-500 text-sm italic text-center py-4 font-light">No significant bullish factors found.</p>
                          )}
                        </div>
                      </div>

                      {/* Negative Points */}
                      <div className="bg-white/[0.02] rounded-2xl border border-rose-500/20 overflow-hidden backdrop-blur-sm relative">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-rose-500/50 to-transparent" />
                        <div className="bg-rose-500/5 px-5 py-4 border-b border-rose-500/10 flex items-center gap-2">
                          <TrendingDown className="w-5 h-5 text-rose-400" />
                          <h3 className="font-mono text-sm tracking-widest text-rose-400 uppercase">Bearish Factors</h3>
                        </div>
                        <div className="p-5">
                          {analyzerResult.negativePoints.length > 0 ? (
                            <ul className="space-y-4">
                              {analyzerResult.negativePoints.map((point, index) => (
                                <li key={index} className="flex items-start gap-3">
                                  <XCircle className="w-5 h-5 text-rose-500/70 flex-shrink-0 mt-0.5" />
                                  <span className="text-slate-300 text-sm leading-relaxed font-light">{point}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-slate-500 text-sm italic text-center py-4 font-light">No significant bearish factors found.</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

      </main>
    </div>
  );
}
