import type { AnalysisResult } from '@/context/AppContext';
import { formatAnalysisDirection, resolveAnalysisDirection } from '@/services/analysisDirection';

type ShareNavigator = Navigator & {
  canShare?: (data: ShareData) => boolean;
};

export type WebShareResult = 'shared' | 'downloaded' | 'cancelled';

function drawWrappedText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const words = text.split(/\s+/);
  let line = '';
  let lineCount = 0;

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      context.fillText(line, x, y + lineCount * lineHeight);
      lineCount += 1;
      if (lineCount >= maxLines) return;
      line = word;
    } else {
      line = candidate;
    }
  }

  if (line && lineCount < maxLines) context.fillText(line, x, y + lineCount * lineHeight);
}

async function loadLocalImage(uri: string) {
  if (!uri.startsWith('data:image/') && !uri.startsWith('blob:')) return null;

  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('The chart image could not be loaded for the share card.'));
    image.src = uri;
  });
  return image;
}

async function createAnalysisCardBlob(analysis: AnalysisResult, isPremium: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1400;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Your browser could not create the share-card image.');

  const displayDirection = resolveAnalysisDirection(
    analysis.tradeSetup?.type,
    analysis.direction,
    analysis.marketBias,
    analysis.analysis?.trend,
    analysis.analysis?.sentiment,
  );
  const isBuy = displayDirection === 'BUY';
  const isSell = displayDirection === 'SELL';
  const accent = isBuy ? '#00E676' : isSell ? '#FF5252' : '#A0A5AD';
  const direction = analysis.status === 'invalid_image'
    ? 'INVALID'
    : formatAnalysisDirection(displayDirection, analysis.status === 'success' && analysis.tradeStatus === 'actionable');
  const entry = analysis.tradeSetup?.entryZone || analysis.entry || '—';
  const stopLoss = analysis.tradeSetup?.stopLoss || analysis.sl || '—';
  const takeProfit = analysis.tradeSetup?.takeProfit || analysis.takeProfitLevels?.join(', ') || analysis.tp || '—';
  const riskReward = analysis.tradeSetup?.riskReward ?? '—';
  const insight = isPremium
    ? analysis.analysis?.notes || analysis.tradeTrigger || analysis.reasoning?.join(' ') || analysis.analysis?.structure || 'Analysis generated from the submitted chart.'
    : 'Unlock full analysis in FXSnap to view the AI reasoning.';

  context.fillStyle = '#080A0D';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#101418';
  context.strokeStyle = '#293039';
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(32, 32, 1016, 1336, 38);
  context.fill();
  context.stroke();

  context.fillStyle = '#F5F7FA';
  context.font = '700 38px Arial, sans-serif';
  context.fillText('FXSNAP', 80, 112);
  context.fillStyle = '#39E58C';
  context.font = '700 20px Arial, sans-serif';
  context.fillText('AI CHART ANALYSIS', 82, 148);

  context.fillStyle = isBuy ? '#123A28' : isSell ? '#421D22' : '#272B30';
  context.beginPath();
  context.roundRect(790, 72, 210, 66, 33);
  context.fill();
  context.fillStyle = accent;
  context.font = '700 22px Arial, sans-serif';
  context.textAlign = 'center';
  context.fillText(direction, 895, 114, 190);
  context.textAlign = 'left';

  context.fillStyle = '#F5F7FA';
  context.font = '700 76px Arial, sans-serif';
  context.fillText(analysis.pair || 'FX Analysis', 80, 248, 920);

  context.fillStyle = '#0A0D10';
  context.beginPath();
  context.roundRect(80, 288, 920, 330, 24);
  context.fill();

  if (analysis.imageUri) {
    try {
      const chartImage = await loadLocalImage(analysis.imageUri);
      if (chartImage) {
        const scale = Math.max(920 / chartImage.width, 330 / chartImage.height);
        const imageWidth = chartImage.width * scale;
        const imageHeight = chartImage.height * scale;
        context.save();
        context.beginPath();
        context.roundRect(80, 288, 920, 330, 24);
        context.clip();
        context.drawImage(chartImage, 80 + (920 - imageWidth) / 2, 288 + (330 - imageHeight) / 2, imageWidth, imageHeight);
        context.restore();
      }
    } catch (error) {
      console.warn('[Share] Chart preview omitted from web share card', error);
    }
  }

  context.fillStyle = '#898F98';
  context.font = '700 18px Arial, sans-serif';
  context.fillText('CONFIDENCE', 80, 684);
  context.fillText('DATE', 724, 684);
  context.fillStyle = accent;
  context.font = '700 60px Arial, sans-serif';
  context.fillText(`${analysis.marketConfidence ?? analysis.confidence ?? 0}%`, 80, 756);
  context.fillStyle = '#F5F7FA';
  context.font = '600 24px Arial, sans-serif';
  context.fillText(new Date(analysis.createdAt).toLocaleDateString(), 724, 756);

  context.strokeStyle = '#293039';
  context.beginPath();
  context.moveTo(80, 802);
  context.lineTo(1000, 802);
  context.stroke();

  context.fillStyle = '#F5F7FA';
  context.font = '700 22px Arial, sans-serif';
  context.fillText('TRADE SETUP', 80, 858);
  const metrics: [string, string][] = [
    ['ENTRY', entry],
    ['STOP LOSS', stopLoss],
    ['TAKE PROFIT', takeProfit],
    ...(isPremium ? [['RISK / REWARD (AI)', String(riskReward)] as [string, string]] : []),
  ];
  metrics.forEach(([label, value], index) => {
    const x = 80 + (index % 2) * 480;
    const y = 916 + Math.floor(index / 2) * 124;
    context.fillStyle = '#898F98';
    context.font = '600 18px Arial, sans-serif';
    context.fillText(label, x, y);
    context.fillStyle = '#F5F7FA';
    context.font = '700 29px Arial, sans-serif';
    context.fillText(value || '—', x, y + 46, 430);
  });

  const insightTop = 1174;
  context.strokeStyle = '#293039';
  context.beginPath();
  context.moveTo(80, insightTop - 34);
  context.lineTo(1000, insightTop - 34);
  context.stroke();
  context.fillStyle = '#39E58C';
  context.font = '700 20px Arial, sans-serif';
  context.fillText('FXSNAP AI INSIGHT', 80, insightTop);
  context.fillStyle = '#F5F7FA';
  context.font = '500 23px Arial, sans-serif';
  drawWrappedText(context, insight, 80, insightTop + 46, 920, 34, 3);

  context.fillStyle = '#898F98';
  context.font = '500 17px Arial, sans-serif';
  context.fillText('Smarter Analysis. Better Trades.', 80, 1302);
  context.fillStyle = '#39E58C';
  context.font = '700 24px Arial, sans-serif';
  context.textAlign = 'right';
  context.fillText('FXSnap', 1000, 1302);
  context.textAlign = 'left';

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Your browser could not export the share-card image.'));
    }, 'image/png');
  });
}

export async function shareAnalysisCardOnWeb(
  analysis: AnalysisResult,
  isPremium: boolean,
): Promise<WebShareResult> {
  const blob = await createAnalysisCardBlob(analysis, isPremium);
  const shareNavigator = navigator as ShareNavigator;

  if (typeof File !== 'undefined' && shareNavigator.share) {
    const file = new File([blob], 'fxsnap-analysis.png', { type: 'image/png' });
    const canShareFiles = shareNavigator.canShare
      ? shareNavigator.canShare({ files: [file] })
      : true;
    if (canShareFiles) {
      try {
        await shareNavigator.share({ files: [file], title: 'FXSnap Analysis' });
        return 'shared';
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
        if (!(error instanceof DOMException && error.name === 'NotAllowedError')) throw error;
      }
    }
  }

  const downloadUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = 'fxsnap-analysis.png';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(downloadUrl), 30_000);
  return 'downloaded';
}
