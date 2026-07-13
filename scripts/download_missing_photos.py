import os
import re
import sys
import requests
import psycopg2
from PIL import Image, ImageEnhance, ImageFilter
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor, as_completed
import argparse

# User Agent for PESDB requests
USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
CARD_URL_TEMPLATE = "https://pesdb.net/assets/img/card/f{player_id}max.png"

# Default Output directory
OUTPUT_DIR = "public/images/players"

def parse_env_file(filepath):
    """Parse .env.local file to retrieve DATABASE_URL"""
    config = {}
    if not os.path.exists(filepath):
        return config
    with open(filepath, 'r') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            match = re.match(r'^([^=]+)=(.*)$', line)
            if match:
                key = match.group(1).strip()
                val = match.group(2).strip().strip('"').strip("'")
                config[key] = val
    return config

class MissingPhotoDownloader:
    def __init__(self, env_path=".env.local", output_dir=OUTPUT_DIR, force=False, upscale_factor=4):
        self.env_path = env_path
        self.output_dir = output_dir
        self.force = force
        self.upscale_factor = upscale_factor
        os.makedirs(self.output_dir, exist_ok=True)
        
    def get_missing_players(self):
        """Fetch all players from active database that do not have local photos"""
        config = parse_env_file(self.env_path)
        db_url = config.get('DATABASE_URL') or config.get('NEON_DATABASE_URL') or config.get('NEON_AUCTION_DB_URL')
        if not db_url:
            print(f"❌ Error: DATABASE_URL not found in env file at {self.env_path}")
            sys.exit(1)
            
        print("🔌 Connecting to Neon PostgreSQL database...")
        conn = psycopg2.connect(db_url)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT player_id, name 
            FROM footballplayers 
            WHERE player_id IS NOT NULL AND player_id != ''
            ORDER BY name ASC
        """)
        all_players = cursor.fetchall()
        cursor.close()
        conn.close()
        
        missing_players = []
        for player_id, name in all_players:
            photo_path = os.path.join(self.output_dir, f"{player_id}.webp")
            # If force is true or image doesn't exist, mark for download
            if self.force or not os.path.exists(photo_path):
                missing_players.append((player_id, name))
                
        print(f"📊 Database players: {len(all_players)}")
        print(f"🔍 Missing images:   {len(missing_players)}")
        return missing_players

    def download_and_crop(self, player_id, name):
        """Download player card, crop to face photo, and save to local directory"""
        photo_path = os.path.join(self.output_dir, f"{player_id}.webp")
        card_url = CARD_URL_TEMPLATE.format(player_id=player_id)
        
        try:
            # Download the card image
            headers = {'User-Agent': USER_AGENT}
            response = requests.get(card_url, timeout=20, headers=headers)
            
            if response.status_code != 200:
                return False, f"HTTP {response.status_code}"
                
            content_type = response.headers.get('Content-Type', '')
            if 'image' not in content_type:
                return False, f"Invalid content type: {content_type}"
                
            # Open image from buffer
            card_image = Image.open(BytesIO(response.content))
            
            # --- Processing: Upscale and Enhance Card ---
            if self.upscale_factor > 1:
                new_size = (card_image.width * self.upscale_factor, card_image.height * self.upscale_factor)
                card_image = card_image.resize(new_size, Image.LANCZOS)
                
            card_image = card_image.convert("RGB")
            
            # Enhancements for maximum facial clarity
            card_image = ImageEnhance.Contrast(card_image).enhance(1.12)
            card_image = card_image.filter(ImageFilter.UnsharpMask(radius=1.5, percent=200, threshold=1))
            card_image = card_image.filter(ImageFilter.EDGE_ENHANCE_MORE)
            card_image = card_image.filter(ImageFilter.DETAIL)
            card_image = card_image.filter(ImageFilter.UnsharpMask(radius=0.8, percent=120, threshold=0))
            card_image = ImageEnhance.Sharpness(card_image).enhance(1.30)
            
            # --- Crop Face Photo ---
            width, height = card_image.size
            center_x = int(width * 0.665)  # 66.5% horizontal
            center_y = int(height * 0.24)  # 24% vertical from top
            crop_size = 140 * self.upscale_factor
            
            left = center_x - crop_size // 2
            top = center_y - crop_size // 2
            right = left + crop_size
            bottom = top + crop_size
            
            photo = card_image.crop((left, top, right, bottom))
            photo = photo.resize((140, 140), Image.LANCZOS)
            
            # Save ONLY the player photo face (WebP format, high quality compression)
            photo.save(photo_path, 'WEBP', quality=95, method=6)
            return True, None
            
        except Exception as e:
            return False, str(e)[:50]

def main():
    parser = argparse.ArgumentParser(description="Download missing player photos into the public folder.")
    parser.add_argument("--env", default=".env.local", help="Path to env configuration file")
    parser.add_argument("--out", default=OUTPUT_DIR, help="Output directory for photos")
    parser.add_argument("--workers", type=int, default=10, help="Number of concurrent download threads")
    parser.add_argument("--force", action="store_true", help="Redownload and overwrite existing photos")
    
    args = parser.parse_args()
    
    downloader = MissingPhotoDownloader(
        env_path=args.env,
        output_dir=args.out,
        force=args.force
    )
    
    missing = downloader.get_missing_players()
    if not missing:
        print("🎉 Success: All database players have local images. Nothing to download!")
        return
        
    print(f"🚀 Downloading {len(missing)} missing photos using {args.workers} threads...")
    
    success_count = 0
    fail_count = 0
    
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(downloader.download_and_crop, pid, name): (pid, name)
            for pid, name in missing
        }
        
        for idx, future in enumerate(as_completed(futures), 1):
            pid, name = futures[future]
            success, err = future.result()
            
            progress = (idx / len(missing)) * 100
            if success:
                success_count += 1
                print(f"[{idx}/{len(missing)}] ({progress:.1f}%) ✅ Successfully downloaded: {name} ({pid})")
            else:
                fail_count += 1
                print(f"[{idx}/{len(missing)}] ({progress:.1f}%) ❌ Failed {name} ({pid}): {err}")
                
    print("\n" + "=" * 60)
    print("FINISHED DOWNLOADING MISSING PHOTOS")
    print("=" * 60)
    print(f"✅ Downloaded successfully: {success_count}")
    print(f"❌ Failed to download:      {fail_count}")
    print(f"📁 Photos saved in:          {args.out}/")
    print("=" * 60)

if __name__ == "__main__":
    main()
