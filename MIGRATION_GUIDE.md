# Migration Guide

This guide explains how to use your exported Imgur data to migrate to another service.

## What's Included in the Export

Your ZIP file contains everything needed for a complete migration:

### 1. **manifest.json** - Master Catalog
Complete metadata for all albums and images including:
- Album structure, titles, descriptions, privacy settings
- Image order within albums (via `orderIndex`)
- Cover image identification (via `coverImageId`)
- Original filenames and Imgur URLs
- All metadata (dimensions, dates, views, etc.)

### 2. **Image Files**
- Actual image files organized by album
- Named: `{Album Name} - {Image Title}.{ext}`
- Full resolution (not thumbnails)

### 3. **album-metadata.json** (per album)
- Self-contained metadata for each album
- Useful for processing albums individually

## Migration to Amazon S3 + CloudFront

### Step 1: Set Up S3 Bucket
```bash
# Create S3 bucket
aws s3 mb s3://your-gallery-bucket

# Enable versioning (optional)
aws s3api put-bucket-versioning \
  --bucket your-gallery-bucket \
  --versioning-configuration Status=Enabled

# Set up CloudFront distribution for CDN (optional)
```

### Step 2: Upload Images
```bash
# Extract your export
unzip imgur-export-2025-12-22.zip -d imgur-export

# Upload all albums to S3
cd imgur-export/albums
aws s3 sync . s3://your-gallery-bucket/albums/ \
  --exclude "*.json" \
  --metadata-directive REPLACE
```

### Step 3: Process Metadata (Sample Python Script)
```python
import json
import boto3
from pathlib import Path

# Load manifest
with open('manifest.json') as f:
    manifest = json.load(f)

s3 = boto3.client('s3')
bucket = 'your-gallery-bucket'

for album in manifest['albums']:
    album_id = album['id']

    # Upload album metadata as tags or DynamoDB
    for image in sorted(album['images'], key=lambda x: x['orderIndex']):
        s3_key = f"albums/{album['folderName']}/{image['filename']}"

        # Set metadata
        s3.copy_object(
            Bucket=bucket,
            CopySource={'Bucket': bucket, 'Key': s3_key},
            Key=s3_key,
            Metadata={
                'title': image.get('title', ''),
                'description': image.get('description', ''),
                'album': album['title'],
                'order': str(image['orderIndex']),
                'created': image['createdAt'],
            },
            MetadataDirective='REPLACE'
        )

        # Tag cover image
        if image['id'] == album.get('coverImageId'):
            s3.put_object_tagging(
                Bucket=bucket,
                Key=s3_key,
                Tagging={'TagSet': [{'Key': 'cover', 'Value': 'true'}]}
            )

print(f"Migrated {manifest['totalImages']} images from {manifest['totalAlbums']} albums")
```

### Step 4: Create Database for Gallery Metadata (Optional)

Store album structure in DynamoDB or PostgreSQL:

```python
# DynamoDB example
dynamodb = boto3.resource('dynamodb')

# Create albums table
albums_table = dynamodb.create_table(
    TableName='Gallery-Albums',
    KeySchema=[{'AttributeName': 'id', 'KeyType': 'HASH'}],
    AttributeDefinitions=[{'AttributeName': 'id', 'AttributeType': 'S'}],
    BillingMode='PAY_PER_REQUEST'
)

# Create images table
images_table = dynamodb.create_table(
    TableName='Gallery-Images',
    KeySchema=[
        {'AttributeName': 'albumId', 'KeyType': 'HASH'},
        {'AttributeName': 'orderIndex', 'KeyType': 'RANGE'}
    ],
    AttributeDefinitions=[
        {'AttributeName': 'albumId', 'AttributeType': 'S'},
        {'AttributeName': 'orderIndex', 'AttributeType': 'N'}
    ],
    BillingMode='PAY_PER_REQUEST'
)

# Populate from manifest
for album in manifest['albums']:
    albums_table.put_item(Item={
        'id': album['id'],
        'title': album['title'],
        'description': album.get('description', ''),
        'privacy': album['privacy'],
        'coverImageId': album.get('coverImageId', ''),
        'imageCount': album['imageCount'],
        'createdAt': album['createdAt'],
    })

    for image in album['images']:
        images_table.put_item(Item={
            'albumId': album['id'],
            'orderIndex': image['orderIndex'],
            'id': image['id'],
            'filename': image['filename'],
            's3Url': f"https://{cloudfront_domain}/albums/{album['folderName']}/{image['filename']}",
            'title': image.get('title', ''),
            'description': image.get('description', ''),
            'width': image['width'],
            'height': image['height'],
            'size': image['size'],
            'mimeType': image['mimeType'],
            'createdAt': image['createdAt'],
        })
```

## Migration to Google Cloud Storage

```bash
# Create bucket
gsutil mb gs://your-gallery-bucket

# Upload images
gsutil -m rsync -r imgur-export/albums gs://your-gallery-bucket/albums

# Set metadata (example)
for album in $(cat manifest.json | jq -r '.albums[].folderName'); do
  for image in imgur-export/albums/"$album"/*.{jpg,png,gif}; do
    [ -f "$image" ] || continue
    gsutil setmeta -h "Cache-Control:public, max-age=31536000" "$image"
  done
done
```

## Migration to Cloudflare R2

Similar to S3, but using R2 endpoints:

```bash
# Configure R2 credentials
aws configure --profile r2

# Upload
aws s3 sync imgur-export/albums/ s3://your-r2-bucket/albums/ \
  --endpoint-url https://<account-id>.r2.cloudflarestorage.com \
  --profile r2
```

## Self-Hosted Solution

### Option 1: Simple Static Gallery

```bash
# Use the folder structure directly
cp -r imgur-export /var/www/gallery

# Generate index.html from manifest
python3 generate_gallery.py manifest.json > /var/www/gallery/index.html
```

### Option 2: PhotoPrism / Immich / Nextcloud

1. Extract images to the appropriate folder
2. Import metadata using their APIs
3. Use `orderIndex` to maintain album ordering

## Preserving Critical Information

When migrating, make sure to preserve:

1. **Image Order** - Use `orderIndex` field (0-based)
2. **Cover Images** - Identify using `coverImageId`
3. **Album Structure** - Maintain folder hierarchy
4. **Metadata** - Titles, descriptions, dates
5. **Privacy Settings** - Map to equivalent in new service

## Example: Complete Migration Script Outline

```python
#!/usr/bin/env python3
import json
from pathlib import Path

def migrate_to_new_service(manifest_path, images_dir):
    # 1. Load manifest
    with open(manifest_path) as f:
        manifest = json.load(f)

    # 2. For each album
    for album in manifest['albums']:
        # Create album in new service
        new_album_id = create_album(
            title=album['title'],
            description=album['description'],
            privacy=album['privacy']
        )

        # 3. Upload images in order
        for image in sorted(album['images'], key=lambda x: x['orderIndex']):
            image_path = images_dir / album['folderName'] / image['filename']

            new_image_id = upload_image(
                path=image_path,
                album_id=new_album_id,
                title=image['title'],
                description=image['description']
            )

            # Map old ID to new ID for reference
            id_mapping[image['id']] = new_image_id

        # 4. Set cover image
        if album.get('coverImageId'):
            new_cover_id = id_mapping[album['coverImageId']]
            set_album_cover(new_album_id, new_cover_id)

    print(f"Migration complete: {manifest['totalAlbums']} albums, {manifest['totalImages']} images")

if __name__ == '__main__':
    migrate_to_new_service('manifest.json', Path('imgur-export/albums'))
```

## Verification

After migration, verify:

1. All albums exist with correct titles/descriptions
2. Image counts match manifest
3. Images are in correct order (check `orderIndex`)
4. Cover images are set correctly
5. Privacy settings are applied
6. Metadata (titles, descriptions) preserved

## Notes

- The manifest format is version `1.0.0` - future versions may add fields
- Original Imgur URLs are preserved for reference/comparison
- Provider metadata may contain Imgur-specific fields not applicable to other services
- Image order is critical - always sort by `orderIndex` when processing
