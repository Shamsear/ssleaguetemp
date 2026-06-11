# Client-Side Background Removal

## Overview

The application now uses **client-side AI-powered background removal** that runs entirely in your browser. This means:

✅ **No API calls** - Everything runs locally  
✅ **No quota limits** - Use it as much as you want  
✅ **No costs** - Completely free  
✅ **Privacy-first** - Images never leave your device  
✅ **Works offline** - Once models are loaded  

## Technology

Uses **@imgly/background-removal** (formerly withoutbg) library which implements:
- ONNX Runtime for running AI models in the browser
- Pre-trained segmentation models
- WebAssembly for high performance
- Web Workers for non-blocking processing

## How It Works

1. **Click "🪄 Remove Background"** button in Photo or Logo controls
2. **First use**: Downloads AI model files (~5-10MB) - cached for future use
3. **Processing**: AI model segments the image and removes background
4. **Result**: Returns a PNG with transparent background
5. **Integration**: Automatically sets as custom photo/logo

## Performance

- **First use**: 10-30 seconds (model download + processing)
- **Subsequent uses**: 3-10 seconds (model cached, only processing)
- **Model size**: ~5-10MB (cached in browser)
- **Model quality**: Medium (balanced between speed and quality)

## Model Options

The library supports three model sizes (configurable in `lib/background-removal.ts`):

- **small**: Fastest, lower quality (~2MB)
- **medium**: Balanced (default) (~5MB)
- **large**: Best quality, slower (~10MB)

## Browser Support

Requires modern browsers with:
- WebAssembly support
- Web Workers support
- File API support

✅ Chrome 90+  
✅ Firefox 88+  
✅ Safari 14.1+  
✅ Edge 90+  

## Limitations

- Larger images take longer to process
- First use requires internet to download models
- Processing is CPU-intensive (may slow down during processing)
- Not recommended for batch processing (process one at a time)

## Usage Tips

1. **Be patient on first use** - Model download takes time
2. **Use smaller images** for faster processing (resize before upload if needed)
3. **One at a time** - Don't start multiple removals simultaneously
4. **Check console** for progress updates
5. **Reload page** if processing seems stuck

## Technical Details

### Files
- `lib/background-removal.ts` - Background removal utility
- `components/PosterStudio.tsx` - Integration with UI
- `next.config.ts` - WebAssembly configuration

### Configuration
Edit `lib/background-removal.ts` to change:
- Model size: `model: 'small' | 'medium' | 'large'`
- Debug mode: `debug: true`
- Progress callbacks

### Error Handling
The system gracefully handles:
- Network errors (model download)
- CORS issues (image fetching)
- Processing errors
- Memory limitations

## Migration from API

Previously used `/api/remove-background` which:
- ❌ Required API keys
- ❌ Had quota limits
- ❌ Cost money per use
- ❌ Required internet connection
- ❌ Sent images to external servers

Now uses client-side processing which:
- ✅ No API keys needed
- ✅ Unlimited use
- ✅ Completely free
- ✅ Works offline (after first model download)
- ✅ Images stay on your device

## Future Improvements

Potential enhancements:
- [ ] Model caching improvements
- [ ] Batch processing support
- [ ] Custom model selection in UI
- [ ] Progress bar in UI
- [ ] Image preprocessing for better results
- [ ] Alternative model providers

## Credits

Built with [@imgly/background-removal](https://github.com/imgly/background-removal-js)
