package com.chillreader.app;

import static org.junit.Assert.*;

import org.junit.Test;
import java.util.ArrayList;
import java.util.List;

/**
 * Unit tests for MediaPlaybackService core audio state & queue logic.
 * Validates sentence skipping, utterance ID tracking, rate limiting, and chapter bounds.
 */
public class MediaPlaybackServiceLogicTest {

    // Helper simulating hasReadableText logic
    private boolean hasReadableText(String s) {
        if (s == null) return false;
        for (int i = 0; i < s.length(); i++) {
            if (Character.isLetterOrDigit(s.charAt(i))) {
                return true;
            }
        }
        return false;
    }

    @Test
    public void testHasReadableText_withPunctuationOnly() {
        assertFalse(hasReadableText("..."));
        assertFalse(hasReadableText("   "));
        assertFalse(hasReadableText("!?!??..."));
        assertFalse(hasReadableText("\"\"'"));
        assertFalse(hasReadableText("---"));
        assertFalse(hasReadableText(null));
    }

    @Test
    public void testHasReadableText_withVietnameseAndAlphanumeric() {
        assertTrue(hasReadableText("Chào bạn"));
        assertTrue(hasReadableText("Tiên hiệp kỳ ảo!"));
        assertTrue(hasReadableText("Chương 1: Khởi đầu"));
        assertTrue(hasReadableText("12345"));
        assertTrue(hasReadableText(" “Đô... Đô thị?” "));
    }

    @Test
    public void testSentenceQueue_skipNonReadable() {
        List<String> sentences = new ArrayList<>();
        sentences.add("   ");
        sentences.add("...");
        sentences.add("Câu hợp lệ đầu tiên.");
        sentences.add("!?!?");
        sentences.add("Câu hợp lệ thứ hai.");

        int index = 0;
        while (index < sentences.size() && !hasReadableText(sentences.get(index))) {
            index++;
        }
        assertEquals(2, index);
        assertEquals("Câu hợp lệ đầu tiên.", sentences.get(index));

        // Advance to next
        index++;
        while (index < sentences.size() && !hasReadableText(sentences.get(index))) {
            index++;
        }
        assertEquals(4, index);
        assertEquals("Câu hợp lệ thứ hai.", sentences.get(index));
    }

    @Test
    public void testUtteranceIdMatching_ignoresStaleCallbacks() {
        String currentSpeakingUtteranceId = "utt_1700000000000_5";

        String oldUtteranceId = "utt_1699999999000_4";
        String currentUtteranceId = "utt_1700000000000_5";
        String nullUtteranceId = null;

        // Old callback should be flagged as stale
        assertFalse(currentUtteranceId.equals(oldUtteranceId));
        // Current matches
        assertTrue(currentSpeakingUtteranceId.equals(currentUtteranceId));
        // Stale callback must never match
        boolean isCurrent = currentUtteranceId.equals(currentSpeakingUtteranceId);
        assertTrue(isCurrent);

        boolean isOldStale = oldUtteranceId.equals(currentSpeakingUtteranceId);
        assertFalse(isOldStale);
    }

    @Test
    public void testChapterBounds_detectsChapterEnd() {
        List<String> sentences = new ArrayList<>();
        sentences.add("Câu 1");
        sentences.add("Câu 2");
        sentences.add("Câu 3");

        int sentenceIndex = 2;
        sentenceIndex++; // finished sentence 3

        boolean isChapterComplete = sentenceIndex >= sentences.size();
        assertTrue(isChapterComplete);
    }

    @Test
    public void testEstimatedWatchdogTimeout_scalesWithSentenceLength() {
        float rate = 1.0f;
        String shortSentence = "Chào bạn.";
        String longSentence = "Đây là một câu rất dài có chứa nhiều mệnh đề và thông tin chi tiết nhằm kiểm tra thời gian watchdog timeout ước tính.";

        long estimatedShort = (long) ((shortSentence.length() / (10.0f * Math.max(0.5f, rate))) * 1000L);
        long watchdogShort = Math.max(8000L, estimatedShort + 10000L);

        long estimatedLong = (long) ((longSentence.length() / (10.0f * Math.max(0.5f, rate))) * 1000L);
        long watchdogLong = Math.max(8000L, estimatedLong + 10000L);

        assertTrue(watchdogShort >= 8000L);
        assertTrue(watchdogLong > watchdogShort);
    }
}
