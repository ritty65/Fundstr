import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import MediaPreview from 'src/components/MediaPreview.vue';
import { isTrustedUrl } from 'src/utils/validateMedia';

// --- Unit Tests for the Sanitization Logic ---

describe('isTrustedUrl', () => {
  it('allows trusted image URLs', () => {
    expect(isTrustedUrl('https://example.com/image.png')).toBe(true);
    expect(isTrustedUrl('http://example.com/image.jpg')).toBe(true);
  });

  it('allows trusted video URLs', () => {
    expect(isTrustedUrl('https://youtube.com/watch?v=123')).toBe(true);
    expect(isTrustedUrl('https://vimeo.com/12345')).toBe(true);
    expect(isTrustedUrl('https://cdn.example.com/video.mp4')).toBe(true);
  });

  it('blocks javascript: URLs', () => {
    expect(isTrustedUrl('javascript:alert(1)')).toBe(false);
  });

  it('blocks data: URLs', () => {
    expect(isTrustedUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });

  it('blocks URLs with embedded event handlers', () => {
    // This is more of a theoretical test for the logic, as browsers wouldn't execute this from an src attribute.
    // However, it ensures our validation logic is strict.
    const maliciousUrl = 'https://example.com/image.png" onerror="alert(1)';
    expect(isTrustedUrl(maliciousUrl)).toBe(false);
  });

  it('blocks blob: URLs', () => {
    expect(isTrustedUrl('blob:https://example.com/some-guid')).toBe(false);
  });
});


// --- Component Test for UI Behavior ---

describe('MediaPreview.vue', () => {
  it('renders nothing when the URL is not trusted', () => {
    const maliciousUrl = 'javascript:alert("XSS")';
    const wrapper = mount(MediaPreview, {
      props: {
        url: maliciousUrl,
      },
    });

    // The component should not render any media elements
    const img = wrapper.find('img');
    const iframe = wrapper.find('iframe');
    const video = wrapper.find('video');

    expect(img.exists()).toBe(false);
    expect(iframe.exists()).toBe(false);
    expect(video.exists()).toBe(false);

    // The root element should be empty because the computed `src` will be an empty string
    expect(wrapper.html()).toBe('<!--v-if-->');
  });

  it('renders an image when the URL is trusted', () => {
    const trustedUrl = 'https://example.com/image.png';
    const wrapper = mount(MediaPreview, {
      props: {
        url: trustedUrl,
      },
    });

    const img = wrapper.find('img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe(trustedUrl);
  });
});
