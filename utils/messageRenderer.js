const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { AttachmentBuilder } = require('discord.js');
const logger = require('./logger');

// --- Constants ---
const PADDING = 16;
const AVATAR_SIZE = 40;
const AVATAR_MARGIN = 14;
const CONTENT_WIDTH = 480;
const LINE_HEIGHT = 22;
const FONT_SIZE = 15;
const SMALL_FONT = 11;

// --- Colors (Discord dark theme) ---
const COLORS = {
  background: '#313338',
  textPrimary: '#dbdee1',
  textSecondary: '#949ba4',
  username: '#f2f3f5',
  link: '#00a8fc',
  codeBg: '#2b2d31',
  codeBorder: '#1e1f22',
  timestamp: '#949ba4',
  hosBadge: '#5865F2',
};

// --- Text wrapping ---
function wrapText(ctx, text, maxWidth) {
  if (!text) return [''];
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}

// --- Parse simple markdown into styled segments ---
// Returns array of { text, bold, italic, mono }
function parseMarkdown(text) {
  if (!text) return [{ text: '', bold: false, italic: false, mono: false }];

  const segments = [];
  let remaining = text;

  // Regex order: code blocks > inline code > bold > italic
  const regex = /```([\s\S]*?)```|`([^`]+)`|\*\*(.+?)\*\*|\*(.+?)\*/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(remaining)) !== null) {
    // Add plain text before this match
    if (match.index > lastIndex) {
      segments.push({
        text: remaining.slice(lastIndex, match.index),
        bold: false,
        italic: false,
        mono: false,
      });
    }

    if (match[1]) {
      // Code block
      segments.push({ text: match[1], bold: false, italic: false, mono: true, block: true });
    } else if (match[2]) {
      // Inline code
      segments.push({ text: match[2], bold: false, italic: false, mono: true });
    } else if (match[3]) {
      // Bold
      segments.push({ text: match[3], bold: true, italic: false, mono: false });
    } else if (match[4]) {
      // Italic
      segments.push({ text: match[4], bold: false, italic: true, mono: false });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < remaining.length) {
    segments.push({
      text: remaining.slice(lastIndex),
      bold: false,
      italic: false,
      mono: false,
    });
  }

  return segments.length > 0 ? segments : [{ text: '', bold: false, italic: false, mono: false }];
}

// --- Draw text with markdown support ---
function drawMarkdownText(ctx, segments, x, y, maxWidth) {
  let currentX = x;
  let currentY = y;
  let lineHeight = 0;

  for (const seg of segments) {
    // Set font style
    let font = `${FONT_SIZE}px `;
    if (seg.mono) {
      font = `${FONT_SIZE - 1}px Consolas, Courier New, monospace`;
    } else if (seg.bold && seg.italic) {
      font = `bold italic ${FONT_SIZE}px Helvetica, Arial, sans-serif`;
    } else if (seg.bold) {
      font = `bold ${FONT_SIZE}px Helvetica, Arial, sans-serif`;
    } else if (seg.italic) {
      font = `italic ${FONT_SIZE}px Helvetica, Arial, sans-serif`;
    } else {
      font = `${FONT_SIZE}px Helvetica, Arial, sans-serif`;
    }
    ctx.font = font;

    // Measure text width
    const textWidth = ctx.measureText(seg.text).width;

    // Check if we need to wrap
    if (currentX + textWidth > x + maxWidth && currentX > x) {
      currentY += LINE_HEIGHT;
      currentX = x;
    }

    // Draw inline code background
    if (seg.mono && !seg.block) {
      const codePadding = 4;
      ctx.fillStyle = COLORS.codeBg;
      const bgX = currentX - codePadding;
      const bgY = currentY - FONT_SIZE + 2;
      const bgW = textWidth + codePadding * 2;
      const bgH = FONT_SIZE + 4;
      roundRect(ctx, bgX, bgY, bgW, bgH, 3);
      ctx.fill();
    }

    // Set text color based on type
    if (seg.mono && !seg.block) {
      ctx.fillStyle = COLORS.textPrimary;
    } else if (seg.mono && seg.block) {
      ctx.fillStyle = COLORS.textPrimary;
    } else {
      // Check if it looks like a URL
      if (/^https?:\/\/[^\s]+$/.test(seg.text)) {
        ctx.fillStyle = COLORS.link;
      } else {
        ctx.fillStyle = COLORS.textPrimary;
      }
    }

    // Draw text
    ctx.fillText(seg.text, currentX, currentY);
    currentX += textWidth;

    // Track line height for this line
    const segHeight = seg.mono ? FONT_SIZE + 4 : FONT_SIZE + 2;
    if (segHeight > lineHeight) lineHeight = segHeight;
  }

  return { nextX: currentX, nextY: currentY, lineHeight };
}

// --- Helper: rounded rectangle ---
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// --- Calculate total height needed ---
function calculateHeight(ctx, message, lines) {
  const headerHeight = 20; // username row
  let contentHeight = Math.max(1, lines.length) * LINE_HEIGHT;
  let attachmentsHeight = 0;

  const firstAttachment = message.attachments?.first();
  if (firstAttachment?.contentType?.startsWith('image/')) {
    attachmentsHeight = 280 + 8; // image + margin
  }

  // Stickers
  if (message.stickers?.size > 0) {
    attachmentsHeight += 140 + 4;
  }

  // Code blocks
  const codeBlockCount = (message.content?.match(/```/g) || []).length / 2;
  if (codeBlockCount > 0) {
    contentHeight += codeBlockCount * 16; // extra padding for code blocks
  }

  return PADDING * 2 + headerHeight + contentHeight + attachmentsHeight;
}

// --- Get role color ---
function getRoleColor(member) {
  if (!member) return null;
  const roleColor = member.roles?.color;
  return roleColor ? roleColor.hexColor : null;
}

// --- Main render function ---
async function renderDiscordMessage(message) {
  try {
    const canvasWidth = PADDING + AVATAR_SIZE + AVATAR_MARGIN + CONTENT_WIDTH + PADDING;

    // Create a temporary canvas to measure text
    const tempCanvas = createCanvas(1, 1);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = `${FONT_SIZE}px Helvetica, Arial, sans-serif`;

    const rawContent = message.content || '';
    const lines = wrapText(tempCtx, rawContent, CONTENT_WIDTH);

    const totalHeight = calculateHeight(tempCtx, message, lines);

    // Create real canvas
    const canvas = createCanvas(canvasWidth, totalHeight);
    const ctx = canvas.getContext('2d');

    // --- Draw background ---
    ctx.fillStyle = COLORS.background;
    ctx.fillRect(0, 0, canvasWidth, totalHeight);

    // --- Draw avatar ---
    const avatarX = PADDING;
    const avatarY = PADDING + 2;

    try {
      const avatarUrl = message.author.displayAvatarURL({
        extension: 'png',
        size: 64,
        forceStatic: true,
      });
      const avatar = await loadImage(avatarUrl);

      // Clip to circle
      ctx.save();
      ctx.beginPath();
      ctx.arc(avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(avatar, avatarX, avatarY, AVATAR_SIZE, AVATAR_SIZE);
      ctx.restore();
    } catch {
      // Fallback: draw colored circle with initial
      const color = getRoleColor(message.member) || '#5865F2';
      ctx.beginPath();
      ctx.arc(avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2, AVATAR_SIZE / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 18px Helvetica, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(message.author.username.charAt(0).toUpperCase(), avatarX + AVATAR_SIZE / 2, avatarY + AVATAR_SIZE / 2);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    // --- Draw username ---
    const textX = PADDING + AVATAR_SIZE + AVATAR_MARGIN;
    const usernameColor = getRoleColor(message.member) || COLORS.username;

    ctx.font = `bold 16px Helvetica, Arial, sans-serif`;
    ctx.fillStyle = usernameColor;
    ctx.fillText(message.author.username, textX, PADDING + 16);

    // --- Draw timestamp ---
    const timestamp = new Date(message.createdTimestamp).toLocaleString('es-ES', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const usernameWidth = ctx.measureText(message.author.username).width;
    ctx.font = `${SMALL_FONT}px Helvetica, Arial, sans-serif`;
    ctx.fillStyle = COLORS.timestamp;
    ctx.fillText(timestamp, textX + usernameWidth + 10, PADDING + 16);

    // --- Draw HOS badge if bot (like cBot2 style) ---
    if (message.author.bot) {
      const badgeX = textX + usernameWidth + 10 + ctx.measureText(timestamp).width + 8;
      ctx.fillStyle = COLORS.hosBadge;
      roundRect(ctx, badgeX, PADDING + 2, 34, 14, 3);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `bold 9px Helvetica, Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('BOT', badgeX + 17, PADDING + 13);
      ctx.textAlign = 'start';
    }

    // --- Draw content with markdown ---
    let currentY = PADDING + 32;

    // Parse full content
    let fullContent = rawContent;

    // Check for code blocks
    const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
    let codeMatch;
    let lastContentIndex = 0;
    let codeBlockResults = [];
    while ((codeMatch = codeBlockRegex.exec(fullContent)) !== null) {
      codeBlockResults.push({ index: codeMatch.index, end: codeMatch.index + codeMatch[0].length, lang: codeMatch[1], code: codeMatch[2] });
    }

    if (codeBlockResults.length > 0) {
      // Draw content with code blocks
      // This is simpler: just draw the whole content as a single block
      // that handles both inline text and code blocks
      let contentPtr = 0;
      for (const cb of codeBlockResults) {
        // Draw text before code block
        const beforeText = fullContent.slice(contentPtr, cb.index);
        if (beforeText) {
          const beforeSegments = parseMarkdown(beforeText);
          const result = drawMarkdownText(ctx, beforeSegments, textX, currentY, CONTENT_WIDTH);
          currentY = Math.max(result.nextY + LINE_HEIGHT, currentY + LINE_HEIGHT);
        }

        // Draw code block
        const cbHeight = Math.max(1, cb.code.split('\n').length) * 18 + 20;
        ctx.fillStyle = COLORS.codeBg;
        roundRect(ctx, textX, currentY - 14, CONTENT_WIDTH, cbHeight, 4);
        ctx.fill();

        // Code block border
        ctx.strokeStyle = COLORS.codeBorder;
        ctx.lineWidth = 1;
        roundRect(ctx, textX, currentY - 14, CONTENT_WIDTH, cbHeight, 4);
        ctx.stroke();

        // Language label
        if (cb.lang) {
          ctx.fillStyle = COLORS.textSecondary;
          ctx.font = `${SMALL_FONT - 1}px Helvetica, Arial, sans-serif`;
          ctx.fillText(cb.lang, textX + 8, currentY - 2);
        }

        // Draw code lines
        ctx.fillStyle = COLORS.textPrimary;
        ctx.font = `13px Consolas, Courier New, monospace`;
        const codeLines = cb.code.split('\n');
        let codeY = currentY + 6;
        for (const line of codeLines) {
          ctx.fillText(line, textX + 10, codeY);
          codeY += 18;
        }

        currentY = currentY + cbHeight + 6;
        contentPtr = cb.end;
      }

      // Draw remaining text after last code block
      const afterText = fullContent.slice(contentPtr);
      if (afterText) {
        // Wrap with markdown stripped for accurate line breaks
        const plainText = afterText.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`([^`]+)`/g, '$1');
        const lines2 = wrapText(ctx, plainText, CONTENT_WIDTH);
        for (const line of lines2) {
          const segs = parseMarkdown(line);
          drawMarkdownText(ctx, segs, textX, currentY, CONTENT_WIDTH);
          currentY += LINE_HEIGHT;
        }
      }
    } else {
      // No code blocks - just draw regular text
      for (const line of lines) {
        const segments = parseMarkdown(line);
        drawMarkdownText(ctx, segments, textX, currentY, CONTENT_WIDTH);
        currentY += LINE_HEIGHT;
      }
    }

    // --- Draw image attachment ---
    const firstAttachment = message.attachments?.first();
    if (firstAttachment?.contentType?.startsWith('image/')) {
      try {
        const img = await loadImage(firstAttachment.url);
        const imgMaxW = CONTENT_WIDTH;
        const imgMaxH = 280;
        const imgW = img.width;
        const imgH = img.height;

        // Scale to fit
        let drawW = imgW;
        let drawH = imgH;
        if (imgW > imgMaxW) {
          drawW = imgMaxW;
          drawH = (imgH / imgW) * drawW;
        }
        if (drawH > imgMaxH) {
          drawH = imgMaxH;
          drawW = (imgW / imgH) * drawH;
        }

        // Rounded corners
        ctx.save();
        roundRect(ctx, textX, currentY + 4, drawW, drawH, 8);
        ctx.clip();
        ctx.drawImage(img, textX, currentY + 4, drawW, drawH);
        ctx.restore();

        currentY += drawH + 8;
      } catch (imgErr) {
        logger.warn('Error loading attachment image:', imgErr.message);
        ctx.fillStyle = COLORS.textSecondary;
        ctx.font = `14px Helvetica, Arial, sans-serif`;
        ctx.fillText(`🖼️ ${firstAttachment.name || 'Imagen'}`, textX, currentY + 16);
        currentY += 24;
      }
    }

    // --- Draw sticker ---
    if (message.stickers?.size > 0) {
      try {
        const sticker = message.stickers.first();
        const stickerUrl = sticker.url;
        if (stickerUrl) {
          const stickerImg = await loadImage(stickerUrl);
          const stickerSize = 130;
          ctx.drawImage(stickerImg, textX, currentY + 4, stickerSize, stickerSize);
          currentY += stickerSize + 8;
        }
      } catch (stickerErr) {
        logger.warn('Error loading sticker:', stickerErr.message);
      }
    }

    // --- Generate buffer ---
    const buffer = canvas.toBuffer('image/png');
    const attachment = new AttachmentBuilder(buffer, { name: 'message.png' });

    return { buffer, attachment };
  } catch (error) {
    logger.error('Error rendering message image:', error.message);
    throw error;
  }
}

module.exports = { renderDiscordMessage };
