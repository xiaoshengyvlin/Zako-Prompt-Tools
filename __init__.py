WEB_DIRECTORY = "./js"

from .nodes.zako_random_prompt import ZakoRandomPrompt
from .nodes.zako_danbooru_search import ZakoDanbooruSearch
from .nodes.zako_tag_translate import ZakoTagTranslate
from .nodes.zako_prompt_enhance import ZakoPromptEnhance
from .server_routes import setup_routes

setup_routes()

NODE_CLASS_MAPPINGS = {
    "ZakoRandomPrompt": ZakoRandomPrompt,
    "ZakoDanbooruSearch": ZakoDanbooruSearch,
    "ZakoTagTranslate": ZakoTagTranslate,
    "ZakoPromptEnhance": ZakoPromptEnhance,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ZakoRandomPrompt": "Zako-Random-Prompt",
    "ZakoDanbooruSearch": "Zako-Danbooru-Search",
    "ZakoTagTranslate": "Zako-Tag-Translate",
    "ZakoPromptEnhance": "Zako-Prompt-Enhance",
}
