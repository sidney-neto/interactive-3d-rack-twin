"""Dell documented chassis dimensions; meters, bottom-center origin, I/O = -Y."""
S5232F_SPEC = {
    "width_m": 0.434, "depth_m": 0.460, "height_m": 0.0436,
    "mounting_width_m": 0.4826, "rack_units": 1,
    "qsfp28_port_count": 32, "qsfp28_nominal_speed_gbps": 100,
    "sfpplus_port_count": 2, "sfpplus_nominal_speed_gbps": 10,
    "psu_count": 2, "fan_module_count": 4,
    "management_ethernet_count": 1, "rj45_console_count": 1,
    "microusb_console_count": 1, "usb_type_a_count": 1,
    "airflow_mode": "unspecified",
}


def qsfp_position(index):
    """Eight 2×2 blocks. Stable viewer IDs: odd upper, even lower, left to right.

    These are physical viewer slots, not a claim about OS interface names.
    """
    if not 1 <= index <= S5232F_SPEC["qsfp28_port_count"]:
        raise ValueError("QSFP28 physical index must be 1–32")
    column, row = (index - 1) // 2, (index - 1) % 2
    return (-0.171 + column * 0.0198 + (column // 2) * 0.0032,
            -S5232F_SPEC["depth_m"] / 2, 0.0296 if row == 0 else 0.0140)
