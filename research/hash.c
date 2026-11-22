#include <stdint.h>

static uint32_t avalanche(uint32_t value) {
    value ^= value >> 16;
    value *= UINT32_C(0x7feb352d);
    value ^= value >> 15;
    value *= UINT32_C(0x846ca68b);
    return value ^ (value >> 16);
}

uint32_t checksum(uint32_t seed, uint32_t count) {
    uint32_t result = seed;
    for (uint32_t i = 0; i < count; i++) {
        result = avalanche(result ^ i);
    }
    return result;
}
