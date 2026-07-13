import os
import re
import sys
import argparse
import sqlite3
import psycopg2

def parse_env_file(filepath):
    """Parse .env.local style files for DATABASE_URL configuration"""
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

def compare_players(sqlite_path, env_path, apply_changes=False, verbose=False, limit_count=None):
    # 1. Parse env and connect to PostgreSQL
    config = parse_env_file(env_path)
    db_url = config.get('DATABASE_URL') or config.get('NEON_DATABASE_URL') or config.get('NEON_AUCTION_DB_URL')
    if not db_url:
        print(f"❌ Error: DATABASE_URL not found in env file at {env_path}")
        return
        
    print(f"🔌 Connecting to Neon PostgreSQL database...")
    try:
        pg_conn = psycopg2.connect(db_url)
        pg_cursor = pg_conn.cursor()
        print("✅ Connected to PostgreSQL successfully.")
    except Exception as e:
        print(f"❌ Failed to connect to PostgreSQL: {e}")
        return

    # 2. Connect to SQLite
    print(f"🔌 Connecting to SQLite database: {sqlite_path}...")
    if not os.path.exists(sqlite_path):
        print(f"❌ Error: SQLite database file not found at {sqlite_path}")
        pg_cursor.close()
        pg_conn.close()
        return
    try:
        sqlite_conn = sqlite3.connect(sqlite_path)
        sqlite_cursor = sqlite_conn.cursor()
        print("✅ Connected to SQLite successfully.")
    except Exception as e:
        print(f"❌ Failed to connect to SQLite: {e}")
        pg_cursor.close()
        pg_conn.close()
        return

    # 3. Load SQLite players from scraper database
    print("🔍 Fetching players from SQLite database...")
    try:
        sqlite_cursor.execute("SELECT * FROM players_all")
        sqlite_rows = sqlite_cursor.fetchall()
        sqlite_colnames = [d[0] for d in sqlite_cursor.description]
        sqlite_players = [dict(zip(sqlite_colnames, row)) for row in sqlite_rows]
        print(f"✅ Loaded {len(sqlite_players)} players from SQLite.")
    except Exception as e:
        print(f"❌ Failed to query SQLite table 'players_all': {e}")
        sqlite_conn.close()
        pg_cursor.close()
        pg_conn.close()
        return

    # Create map by player_id
    sqlite_map = {}
    for p in sqlite_players:
        p_id = p.get('player_id')
        if p_id:
            sqlite_map[str(p_id)] = p

    # 4. Load PostgreSQL players from active database
    print("🔍 Fetching players from PostgreSQL database...")
    try:
        pg_cursor.execute("SELECT * FROM footballplayers")
        pg_rows = pg_cursor.fetchall()
        pg_colnames = [d[0] for d in pg_cursor.description]
        pg_players = [dict(zip(pg_colnames, row)) for row in pg_rows]
        print(f"✅ Loaded {len(pg_players)} players from PostgreSQL.")
    except Exception as e:
        print(f"❌ Failed to query PostgreSQL table 'footballplayers': {e}")
        sqlite_conn.close()
        pg_cursor.close()
        pg_conn.close()
        return

    # 5. Compare
    print("\n⚖️ Comparing active player data against scraped database...")
    print("=" * 80)
    
    fields_to_compare = [
        'position', 'overall_rating', 'playing_style',
        'offensive_awareness', 'ball_control', 'dribbling', 'tight_possession',
        'low_pass', 'lofted_pass', 'finishing', 'heading', 'set_piece_taking',
        'curl', 'speed', 'acceleration', 'kicking_power', 'jumping',
        'physical_contact', 'balance', 'stamina', 'defensive_awareness',
        'tackling', 'aggression', 'defensive_engagement', 'gk_awareness',
        'gk_catching', 'gk_parrying', 'gk_reflexes', 'gk_reach'
    ]

    players_updated = 0
    players_unchanged = 0
    players_not_found = 0
    total_checked = 0

    for pg_p in pg_players:
        pg_id = pg_p.get('player_id')
        if not pg_id:
            continue
        
        total_checked += 1
        sqlite_p = sqlite_map.get(str(pg_id))
        if not sqlite_p:
            players_not_found += 1
            if verbose:
                print(f"⚠️ Player '{pg_p.get('name')}' (ID: {pg_id}) not found in SQLite scraped data.")
            continue

        # Check for differences
        diffs = {}
        for field in fields_to_compare:
            pg_val = pg_p.get(field)
            sq_val = sqlite_p.get(field)

            # Normalize values for fair comparison
            if isinstance(pg_val, str) or isinstance(sq_val, str):
                pg_val_norm = str(pg_val or '').strip().lower()
                sq_val_norm = str(sq_val or '').strip().lower()
                if pg_val_norm != sq_val_norm:
                    diffs[field] = (pg_val or 'None', sq_val or 'None')
            else:
                pg_val_norm = int(pg_val or 0)
                sq_val_norm = int(sq_val or 0)
                if pg_val_norm != sq_val_norm:
                    diffs[field] = (pg_val_norm, sq_val_norm)

        if diffs:
            players_updated += 1
            print(f"🔄 Differences found for '{pg_p.get('name')}' (ID: {pg_id}, Team: {pg_p.get('team_name') or 'Free Agent'}):")
            for field, (old, new) in diffs.items():
                print(f"   • {field:22}: {old} -> {new}")
            
            # Apply changes if requested
            if apply_changes:
                update_fields = []
                update_vals = []
                for field in diffs.keys():
                    update_fields.append(f"{field} = %s")
                    update_vals.append(sqlite_p[field])
                update_vals.append(pg_id)
                
                update_query = f"UPDATE footballplayers SET {', '.join(update_fields)}, updated_at = NOW() WHERE player_id = %s"
                try:
                    pg_cursor.execute(update_query, tuple(update_vals))
                    print(f"   ✅ [APPLIED] Updated database attributes.")
                except Exception as e:
                    print(f"   ❌ [FAILED] Failed to update in PostgreSQL: {e}")
                    pg_conn.rollback()
            
            if limit_count and players_updated >= limit_count:
                print(f"\nReached display limit of {limit_count} modified players.")
                break
        else:
            players_unchanged += 1

    if apply_changes and players_updated > 0:
        try:
            pg_conn.commit()
            print(f"\n💾 All modifications committed to Neon PostgreSQL database.")
        except Exception as e:
            print(f"❌ Failed to commit transactions: {e}")

    pg_cursor.close()
    pg_conn.close()
    sqlite_conn.close()

    print("\n" + "=" * 80)
    print("📈 COMPARISON SUMMARY")
    print("=" * 80)
    print(f"Total active players in database: {len(pg_players)}")
    print(f"Total checked:                   {total_checked}")
    print(f"Out-of-sync / Needs Update:      {players_updated}")
    print(f"In-sync / Matches Scraper:       {players_unchanged}")
    print(f"Missing from Scraper SQLite:     {players_not_found}")
    print("=" * 80)
    if not apply_changes and players_updated > 0:
        print("💡 Run with --apply flag to update the out-of-sync players in the active database.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Compare eFootball database players with active PostgreSQL players")
    parser.add_argument("--db", default="efootball_latest.db", help="Path to SQLite database file")
    parser.add_argument("--env", default=".env.local", help="Path to Next.js env configuration file")
    parser.add_argument("--apply", action="store_true", help="Apply updates directly to the active PostgreSQL database")
    parser.add_argument("--verbose", action="store_true", help="Print details on missing scraper entries")
    parser.add_argument("--limit", type=int, default=None, help="Limit output/updates to this number of players")
    
    args = parser.parse_args()
    
    compare_players(
        sqlite_path=args.db,
        env_path=args.env,
        apply_changes=args.apply,
        verbose=args.verbose,
        limit_count=args.limit
    )
