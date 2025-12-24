#!/usr/bin/env python3
"""
Panda Sprite Sheet Processor
Converts the Gemini-generated panda sprite sheet into the format needed for the T-Rex game.

Required format:
- 1x: 262 x 47 pixels (6 frames of 44x47 each)
- 2x: 524 x 94 pixels (6 frames of 88x94 each)

Frame layout:
- Frame 0 (x=0): Jumping/Standing
- Frame 1 (x=44): Waiting/Blinking
- Frame 2 (x=88): Running 1
- Frame 3 (x=132): Running 2
- Frame 4 (x=176): Running 3 (or Standing)
- Frame 5 (x=220): Crashed
"""

from PIL import Image
import base64
import io

# Load the source image
source_path = "Gemini_Generated_Image_tkx0ptkx0ptkx0pt (1).png"
source = Image.open(source_path)

print(f"Source image size: {source.size}")
print(f"Source image mode: {source.mode}")

# Analyze the image - find sprite boundaries
# The sprites appear to be evenly spaced. Let's calculate approximate positions.
width, height = source.size

# Looking at the image, sprites are roughly:
# - Each panda is approximately 140-180 pixels wide
# - There are 7 sprites
# - They're roughly evenly distributed

# Let's define approximate crop boxes for each sprite
# (left, upper, right, lower)
# We need to crop each sprite and resize to 44x47

# Approximate sprite boundaries (adjust these based on image analysis)
# The image is 1408x512 based on the proportions shown
sprites_approx = [
    (45, 260, 215, 480),    # Frame 0: Standing (for jumping)
    (265, 260, 420, 480),   # Frame 1: Idle (for waiting/blinking)
    (490, 260, 670, 480),   # Frame 2: Running 1
    (700, 260, 876, 480),   # Frame 3: Running 2  
    (935, 260, 1085, 480),   # Frame 4: Running 3/Standing
    (1110, 260, 1360, 480), # Frame 5: Crashed
]

# First, let's create a version that shows the detected boundaries
debug = source.copy()

# Create target sprite sheets
# 1x version: 262 x 47
sprite_1x = Image.new('RGBA', (262, 47), (255, 255, 255, 0))
# 2x version: 524 x 94  
sprite_2x = Image.new('RGBA', (524, 94), (255, 255, 255, 0))

frame_width_1x = 44
frame_height_1x = 47
frame_width_2x = 88
frame_height_2x = 94

print("\nProcessing sprites...")

for i, box in enumerate(sprites_approx):
    # Crop the sprite
    sprite = source.crop(box)
    sprite_w, sprite_h = sprite.size
    
    # Calculate aspect ratio and resize
    # Target is 44x47 for 1x
    target_ratio = frame_width_1x / frame_height_1x
    sprite_ratio = sprite_w / sprite_h
    
    # Resize maintaining aspect ratio, then fit in frame
    if sprite_ratio > target_ratio:
        # Sprite is wider, fit by width
        new_width = frame_width_1x
        new_height = int(frame_width_1x / sprite_ratio)
    else:
        # Sprite is taller, fit by height
        new_height = frame_height_1x
        new_width = int(frame_height_1x * sprite_ratio)
    
    # Resize for 1x
    resized_1x = sprite.resize((new_width, new_height), Image.Resampling.LANCZOS)
    
    # Center in frame
    x_offset = (frame_width_1x - new_width) // 2
    y_offset = frame_height_1x - new_height  # Align to bottom
    
    # Paste into 1x sprite sheet
    sprite_1x.paste(resized_1x, (i * frame_width_1x + x_offset, y_offset))
    
    # Same for 2x
    resized_2x = sprite.resize((new_width * 2, new_height * 2), Image.Resampling.LANCZOS)
    sprite_2x.paste(resized_2x, (i * frame_width_2x + x_offset * 2, y_offset * 2))
    
    print(f"  Frame {i}: cropped {box}, resized to {new_width}x{new_height}")

# Save the sprite sheets
sprite_1x.save("public/panda-1x.png")
sprite_2x.save("public/panda-2x.png")
print(f"\nSaved: public/panda-1x.png (262x47)")
print(f"Saved: public/panda-2x.png (524x94)")

# Convert to base64
def image_to_base64(img):
    buffer = io.BytesIO()
    img.save(buffer, format='PNG')
    return base64.b64encode(buffer.getvalue()).decode('utf-8')

base64_1x = image_to_base64(sprite_1x)
base64_2x = image_to_base64(sprite_2x)

# Save base64 strings to files
with open("panda-1x-base64.txt", "w") as f:
    f.write(f"data:image/png;base64,{base64_1x}")
    
with open("panda-2x-base64.txt", "w") as f:
    f.write(f"data:image/png;base64,{base64_2x}")

print("\nSaved base64 strings to:")
print("  panda-1x-base64.txt")
print("  panda-2x-base64.txt")

print("\n" + "="*60)
print("TO UPDATE THE GAME:")
print("="*60)
print("""
1. Open sweta-tracker/public/dino-game.html
2. Find line 2549 with: <img id="1x-trex" src="data:image/png;base64,...
3. Replace the src value with contents of panda-1x-base64.txt
4. Find line 2550 with: <img id="2x-trex" src="data:image/png;base64,...
5. Replace the src value with contents of panda-2x-base64.txt
""")

# Also print preview of base64 strings
print("\n1x Base64 (first 100 chars):")
print(f"data:image/png;base64,{base64_1x[:100]}...")
print(f"\nTotal 1x base64 length: {len(base64_1x)} chars")

print("\n2x Base64 (first 100 chars):")
print(f"data:image/png;base64,{base64_2x[:100]}...")
print(f"\nTotal 2x base64 length: {len(base64_2x)} chars")

