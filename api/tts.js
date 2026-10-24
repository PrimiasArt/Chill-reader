import { Communicate } from 'edge-tts-universal';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let text = urlObj.searchParams.get('text');
    let voice = urlObj.searchParams.get('voice') || 'vi-VN-NamMinhNeural';
    let rate = urlObj.searchParams.get('rate') || '1.0';
    let pitch = urlObj.searchParams.get('pitch') || '1.0';

    if (req.method === 'POST' && req.body) {
      if (req.body.text) text = req.body.text;
      if (req.body.voice) voice = req.body.voice;
      if (req.body.rate) rate = req.body.rate;
      if (req.body.pitch) pitch = req.body.pitch;
    }

    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Thiếu nội dung văn bản (text).' });
      return;
    }

    let sanitizedText = text
      .trim()
      .replace(/&amp;/gi, ' và ')
      .replace(/&/g, ' và ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/[<>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // If text has no readable alphanumeric characters, return short silent MP3
    if (!/[a-zA-Z0-9\u00C0-\u1EF9]/.test(sanitizedText)) {
      const silentMp3 = Buffer.from('//uQxAAAAANIAAAAAExBTUUzLjEwMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', 'base64');
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      res.status(200).send(silentMp3);
      return;
    }

    // 1. Google Translate TTS Provider (Default Google voice / Android voice)
    if (voice === 'google' || voice === 'google:vi' || voice === 'native:android' || voice.startsWith('native:')) {
      const googleUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(sanitizedText)}`;
      const gRes = await fetch(googleUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!gRes.ok) {
        throw new Error(`Google TTS lỗi HTTP ${gRes.status}`);
      }

      const arrayBuffer = await gRes.arrayBuffer();
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      res.status(200).send(Buffer.from(arrayBuffer));
      return;
    }

    // 2. Microsoft Edge Neural Provider (Nam Minh, Hoài My...)
    const cleanVoice = voice.replace(/^edge:/, '');

    const parsedRate = parseFloat(rate) || 1.0;
    // Edge TTS Speech Service accepts prosody rate between -50% and +100% (0.5x to 2.0x).
    const clampedRate = Math.max(0.5, Math.min(2.0, parsedRate));
    const ratePercent = Math.round((clampedRate - 1.0) * 100);
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

    const pitchHz = Math.round((parseFloat(pitch) - 1.0) * 50);
    const pitchStr = pitchHz >= 0 ? `+${pitchHz}Hz` : `${pitchHz}Hz`;

    try {
      const edgePromise = (async () => {
        const comm = new Communicate(sanitizedText, {
          voice: cleanVoice,
          rate: rateStr,
          pitch: pitchStr
        });

        const chunks = [];
        for await (const chunk of comm.stream()) {
          if (chunk.type === 'audio' && chunk.data) {
            chunks.push(chunk.data);
          }
        }
        return chunks.length > 0 ? Buffer.concat(chunks) : null;
      })();

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Edge TTS timed out after 5s')), 5000)
      );

      const audioBuffer = await Promise.race([edgePromise, timeoutPromise]);
      if (audioBuffer) {
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
        res.status(200).send(audioBuffer);
        return;
      }
    } catch (edgeErr) {
      console.warn('Edge TTS failed or timed out, attempting Google fallback:', edgeErr.message);
    }

    // Fallback to Google Translate TTS
    const fallbackUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(sanitizedText)}`;
    const fRes = await fetch(fallbackUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(10000)
    });

    if (fRes.ok) {
      const arrayBuffer = await fRes.arrayBuffer();
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
      res.status(200).send(Buffer.from(arrayBuffer));
      return;
    }

    throw new Error('Không thể tạo âm thanh từ cả Edge TTS và Google TTS.');
  } catch (err) {
    console.error('TTS API error:', err);
    res.status(500).json({ error: err.message || 'Lỗi tạo âm thanh TTS.' });
  }
}
